/**
 * External scanner for Crystal's context-sensitive tokens.
 *
 * Tree-sitter's grammar rules (grammar.js) handle most syntax declaratively,
 * but certain Crystal constructs require stateful, context-aware lexing that
 * the generated parser cannot do alone. This scanner handles:
 *
 *   - String literals ("...") with #{} interpolation and escape sequences
 *   - Command literals (`...`) with interpolation
 *   - Regex literals (/.../) disambiguated from division operator
 *   - Heredocs (<<-ID ... ID, <<~ID ... ID) with interpolation
 *   - Percent literals (%w(), %i(), %q(), %Q(), %r(), %x(), %()) with
 *     balanced delimiter tracking and optional interpolation
 *
 * Architecture:
 *   - A context stack tracks nested lexing states (e.g., string inside
 *     interpolation inside heredoc)
 *   - The scanner state is serialized/deserialized for incremental parsing
 *   - Content scanning stops at boundaries (#{ for interpolation, \ for
 *     escapes) so the grammar can match those tokens with proper AST nodes
 *
 * The TokenType enum order MUST match the `externals` array in grammar.js.
 */

#include "tree_sitter/alloc.h"
#include "tree_sitter/array.h"
#include "tree_sitter/parser.h"

#include <string.h>

// =============================================================================
// Token types — must match the `externals` array order in grammar.js
// =============================================================================
enum TokenType {
  STRING_START,
  STRING_CONTENT,
  STRING_END,
  INTERPOLATION_START,
  INTERPOLATION_END,
  HEREDOC_START,
  HEREDOC_CONTENT,
  HEREDOC_END,
  REGEX_START,
  REGEX_CONTENT,
  REGEX_END,
  COMMAND_START,
  COMMAND_CONTENT,
  COMMAND_END,
  PERCENT_LITERAL_START,
  PERCENT_LITERAL_CONTENT,
  PERCENT_LITERAL_END,
};

// =============================================================================
// Context types for the scanner stack
// =============================================================================
enum ContextType {
  CTX_NONE = 0,
  CTX_STRING,            // "..."
  CTX_COMMAND,           // `...`
  CTX_REGEX,             // /.../
  CTX_HEREDOC,           // <<-ID ... ID
  CTX_PERCENT_STRING,    // %Q(...) or %(...)
  CTX_PERCENT_RAW,       // %q(...)
  CTX_PERCENT_WORDS,     // %w(...)
  CTX_PERCENT_SYMBOLS,   // %i(...)
  CTX_PERCENT_REGEX,     // %r(...)
  CTX_PERCENT_COMMAND,   // %x(...)
  CTX_INTERPOLATION,     // inside #{...}
};

// =============================================================================
// Scanner context entry
// =============================================================================
typedef struct {
  enum ContextType type;
  int32_t open_delimiter;   // opening char for percent literals
  int32_t close_delimiter;  // closing char for percent literals
  int nesting_depth;        // brace/bracket/paren nesting for percent literals
} Context;

// =============================================================================
// Scanner state
// =============================================================================
#define MAX_HEREDOC_ID 64

typedef struct {
  Array(Context) stack;
  char heredoc_id[MAX_HEREDOC_ID];
  uint8_t heredoc_id_len;
  bool heredoc_indent; // <<~ style (strip leading whitespace)
} Scanner;

// =============================================================================
// Helpers — context stack management and character classification
// =============================================================================

/** Returns the top of the context stack, or NULL if empty. */
static inline Context *current_context(Scanner *scanner) {
  if (scanner->stack.size == 0) return NULL;
  return array_back(&scanner->stack);
}

/** Pushes a new context onto the stack (e.g., entering a string or interpolation). */
static inline void push_context(Scanner *scanner, enum ContextType type) {
  Context ctx = {.type = type, .open_delimiter = 0, .close_delimiter = 0, .nesting_depth = 0};
  array_push(&scanner->stack, ctx);
}

/** Pops the top context (e.g., exiting a string or interpolation). */
static inline void pop_context(Scanner *scanner) {
  if (scanner->stack.size > 0) {
    array_pop(&scanner->stack);
  }
}

/** Returns the closing delimiter for a given opening delimiter (e.g., '(' -> ')'). */
static int32_t matching_delimiter(int32_t open) {
  switch (open) {
    case '(': return ')';
    case '[': return ']';
    case '{': return '}';
    case '<': return '>';
    case '|': return '|';
    default:  return open; // same char for things like /, !, etc.
  }
}

static bool is_identifier_char(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
         (c >= '0' && c <= '9') || c == '_';
}

static bool is_identifier_start(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_';
}

/**
 * Heuristic for regex vs division disambiguation.
 *
 * After expression-ending tokens (identifiers, numbers, `)`, `]`, `}`), `/` is
 * division. After operators, keywords, and line starts, `/` begins a regex.
 * This function returns true if `/` should be treated as regex start.
 *
 * Note: currently unused — the grammar's valid_symbols mechanism handles this
 * disambiguation, but kept for reference.
 */
static bool can_be_regex_after(int32_t prev) {
  // After these, `/` is regex
  switch (prev) {
    case '=': case '(': case '[': case '{': case ',':
    case ';': case '!': case '~': case '|': case '&':
    case '^': case '<': case '>': case '+': case '-':
    case '*': case '/': case '%': case '?': case ':':
    case '\n': case '\r': case 0:
      return true;
    default:
      return false;
  }
}

/** Returns true if the given context type supports #{} string interpolation. */
static bool context_supports_interpolation(enum ContextType type) {
  switch (type) {
    case CTX_STRING:
    case CTX_COMMAND:
    case CTX_HEREDOC:
    case CTX_PERCENT_STRING:
    case CTX_PERCENT_REGEX:
    case CTX_PERCENT_COMMAND:
      return true;
    default:
      return false;
  }
}

// =============================================================================
// Lifecycle functions — required by tree-sitter's external scanner API
// =============================================================================

/** Allocates and initializes scanner state. Called once when the parser is created. */
void *tree_sitter_crystal_external_scanner_create() {
  Scanner *scanner = ts_calloc(1, sizeof(Scanner));
  array_init(&scanner->stack);
  scanner->heredoc_id_len = 0;
  scanner->heredoc_indent = false;
  return scanner;
}

/** Frees scanner state. Called when the parser is destroyed. */
void tree_sitter_crystal_external_scanner_destroy(void *payload) {
  Scanner *scanner = payload;
  array_delete(&scanner->stack);
  ts_free(scanner);
}

/**
 * Serializes scanner state to a byte buffer for incremental parsing.
 *
 * Layout: [stack_size] [ctx entries...] [heredoc_id_len] [heredoc_indent] [heredoc_id...]
 * Each context entry is 4 bytes: [type, open_delim, close_delim, nesting_depth].
 */
unsigned tree_sitter_crystal_external_scanner_serialize(void *payload, char *buffer) {
  Scanner *scanner = payload;
  unsigned size = 0;

  // Write stack size
  uint8_t stack_size = (uint8_t)scanner->stack.size;
  if (size + 1 > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) return size;
  buffer[size++] = stack_size;

  // Write each context entry
  for (unsigned i = 0; i < scanner->stack.size; i++) {
    if (size + 4 > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) break;
    Context *ctx = &scanner->stack.contents[i];
    buffer[size++] = (char)ctx->type;
    buffer[size++] = (char)(ctx->open_delimiter & 0xFF);
    buffer[size++] = (char)(ctx->close_delimiter & 0xFF);
    buffer[size++] = (char)(ctx->nesting_depth & 0xFF);
  }

  // Write heredoc state
  if (size + 2 + scanner->heredoc_id_len > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) return size;
  buffer[size++] = scanner->heredoc_id_len;
  buffer[size++] = scanner->heredoc_indent ? 1 : 0;
  memcpy(buffer + size, scanner->heredoc_id, scanner->heredoc_id_len);
  size += scanner->heredoc_id_len;

  return size;
}

/** Restores scanner state from a serialized byte buffer. Inverse of serialize. */
void tree_sitter_crystal_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  Scanner *scanner = payload;
  array_clear(&scanner->stack);
  scanner->heredoc_id_len = 0;
  scanner->heredoc_indent = false;

  if (length == 0) return;

  unsigned pos = 0;

  // Read stack size
  uint8_t stack_size = (uint8_t)buffer[pos++];

  // Read each context entry
  for (unsigned i = 0; i < stack_size && pos + 4 <= length; i++) {
    Context ctx;
    ctx.type = (enum ContextType)(uint8_t)buffer[pos++];
    ctx.open_delimiter = (uint8_t)buffer[pos++];
    ctx.close_delimiter = (uint8_t)buffer[pos++];
    ctx.nesting_depth = (uint8_t)buffer[pos++];
    array_push(&scanner->stack, ctx);
  }

  // Read heredoc state
  if (pos + 2 <= length) {
    scanner->heredoc_id_len = (uint8_t)buffer[pos++];
    scanner->heredoc_indent = buffer[pos++] != 0;
    if (pos + scanner->heredoc_id_len <= length && scanner->heredoc_id_len < MAX_HEREDOC_ID) {
      memcpy(scanner->heredoc_id, buffer + pos, scanner->heredoc_id_len);
      pos += scanner->heredoc_id_len;
    } else {
      scanner->heredoc_id_len = 0;
    }
  }
}

// =============================================================================
// Scan function — the main entry point called by tree-sitter's parser
// =============================================================================

/** Advances the lexer by one character (consumed into the token). */
static void advance(TSLexer *lexer) {
  lexer->advance(lexer, false);
}

/** Advances the lexer by one character (skipped, not included in the token). */
static void skip(TSLexer *lexer) {
  lexer->advance(lexer, true);
}

/**
 * Scans string content between delimiters.
 * Stops at: `"` (end), `#{` (interpolation start), `\` (escape sequence).
 * Returns true if any content was consumed.
 */
static bool scan_string_content(TSLexer *lexer) {
  bool has_content = false;

  while (true) {
    if (lexer->eof(lexer)) {
      lexer->mark_end(lexer);
      return has_content;
    }

    switch (lexer->lookahead) {
      case '"':
        // End of string — don't consume, return what we have
        lexer->mark_end(lexer);
        return has_content;

      case '#':
        // Peek ahead: is this #{?
        lexer->mark_end(lexer);
        advance(lexer);
        if (lexer->lookahead == '{') {
          // Interpolation coming — DON'T consume #, return content before it
          // mark_end was set before #, so token doesn't include #
          return has_content;
        }
        // Just a # character — it's part of the content
        has_content = true;
        lexer->mark_end(lexer);
        break;

      case '\\':
        // Stop before escape sequence so grammar can match escape_sequence token
        lexer->mark_end(lexer);
        return has_content;

      default:
        has_content = true;
        advance(lexer);
        lexer->mark_end(lexer);
        break;
    }
  }
}

/**
 * Scans command literal content (backtick strings).
 * Stops at: `` ` `` (end), `#{` (interpolation start), `\` (escape sequence).
 */
static bool scan_command_content(TSLexer *lexer) {
  bool has_content = false;

  while (true) {
    if (lexer->eof(lexer)) { lexer->mark_end(lexer); return has_content; }

    switch (lexer->lookahead) {
      case '`':
        lexer->mark_end(lexer);
        return has_content;

      case '#':
        lexer->mark_end(lexer);
        advance(lexer);
        if (lexer->lookahead == '{') return has_content;
        has_content = true;
        lexer->mark_end(lexer);
        break;

      case '\\':
        // Stop before escape sequence so grammar can match escape_sequence token
        lexer->mark_end(lexer);
        return has_content;

      default:
        has_content = true;
        advance(lexer);
        lexer->mark_end(lexer);
        break;
    }
  }
}

/**
 * Scans regex literal content.
 * Stops at: `/` (end), `#{` (interpolation start), `\` (escape sequence).
 */
static bool scan_regex_content(TSLexer *lexer) {
  bool has_content = false;

  while (true) {
    if (lexer->eof(lexer)) { lexer->mark_end(lexer); return has_content; }

    switch (lexer->lookahead) {
      case '/':
        lexer->mark_end(lexer);
        return has_content;

      case '#':
        lexer->mark_end(lexer);
        advance(lexer);
        if (lexer->lookahead == '{') return has_content;
        has_content = true;
        lexer->mark_end(lexer);
        break;

      case '\\':
        // Stop before escape sequence so grammar can match escape_sequence token
        lexer->mark_end(lexer);
        return has_content;

      default:
        has_content = true;
        advance(lexer);
        lexer->mark_end(lexer);
        break;
    }
  }
}

/**
 * Scans percent literal content (%w(), %q(), etc.).
 * Handles balanced delimiter nesting (e.g., %w(a (b) c) tracks paren depth).
 * Stops at: closing delimiter (at depth 0), `#{` (if interpolation-capable), `\`.
 */
static bool scan_percent_content(Scanner *scanner, TSLexer *lexer) {
  Context *ctx = current_context(scanner);
  if (!ctx) return false;

  bool has_content = false;
  bool supports_interpolation = context_supports_interpolation(ctx->type);

  while (true) {
    if (lexer->eof(lexer)) return has_content;

    int32_t c = lexer->lookahead;

    // Check for close delimiter
    if (c == ctx->close_delimiter) {
      if (ctx->nesting_depth > 0) {
        ctx->nesting_depth--;
        has_content = true;
        advance(lexer);
        continue;
      }
      return has_content;
    }

    // Check for open delimiter (nesting)
    if (c == ctx->open_delimiter && ctx->open_delimiter != ctx->close_delimiter) {
      ctx->nesting_depth++;
      has_content = true;
      advance(lexer);
      continue;
    }

    // Check for interpolation
    if (supports_interpolation && c == '#') {
      lexer->mark_end(lexer);
      advance(lexer);
      if (lexer->lookahead == '{') {
        return has_content;
      }
      has_content = true;
      continue;
    }

    // Stop before escape sequence so grammar can match escape_sequence token
    if (c == '\\') {
      lexer->mark_end(lexer);
      return has_content;
    }

    has_content = true;
    advance(lexer);
  }
}

/**
 * Scans heredoc content.
 * Stops at: `#{` (interpolation), `\` (escape), or when the heredoc terminator
 * identifier appears on its own line (with optional leading whitespace).
 * The terminator itself is NOT consumed — it's matched by HEREDOC_END.
 */
static bool scan_heredoc_content(Scanner *scanner, TSLexer *lexer) {
  bool has_content = false;

  while (true) {
    if (lexer->eof(lexer)) return has_content;

    int32_t c = lexer->lookahead;

    // Check for interpolation
    if (c == '#') {
      lexer->mark_end(lexer);
      advance(lexer);
      if (lexer->lookahead == '{') {
        return has_content;
      }
      has_content = true;
      continue;
    }

    // Stop before escape sequence so grammar can match escape_sequence token
    if (c == '\\') {
      lexer->mark_end(lexer);
      return has_content;
    }

    // Check for potential heredoc end: newline + optional whitespace + identifier
    if (c == '\n') {
      has_content = true;
      advance(lexer);
      lexer->mark_end(lexer);

      // Skip leading whitespace
      while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        advance(lexer);
      }

      // Check if identifier matches
      if (scanner->heredoc_id_len > 0) {
        bool match = true;
        for (uint8_t i = 0; i < scanner->heredoc_id_len; i++) {
          if (lexer->eof(lexer) || (char)lexer->lookahead != scanner->heredoc_id[i]) {
            match = false;
            break;
          }
          advance(lexer);
        }
        // After the identifier, must be newline or EOF
        if (match && (lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == '\r')) {
          // Don't consume the identifier — that's for HEREDOC_END
          // Return content up to the newline before the identifier
          return has_content;
        }
      }
      continue;
    }

    has_content = true;
    advance(lexer);
  }
}

/**
 * Main scan entry point — called by tree-sitter when an external token might match.
 *
 * The `valid_symbols` array indicates which external tokens the parser expects
 * at the current position. The scanner checks the current context stack and
 * lookahead character to decide what to emit.
 *
 * Dispatch order:
 *   1. Interpolation end (}) — if inside #{...} interpolation
 *   2. Context-specific scanning — string/command/regex/heredoc/percent content
 *   3. Top-level token starts — opening delimiters for new strings/regex/etc.
 */
bool tree_sitter_crystal_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  Scanner *scanner = payload;

  // Guard: in error recovery mode, all valid_symbols are set to true.
  // Return false to let the grammar's internal lexer handle tokenization,
  // preventing the scanner from creating spurious contexts.
  bool all_valid = true;
  for (int i = 0; i <= PERCENT_LITERAL_END; i++) {
    if (!valid_symbols[i]) { all_valid = false; break; }
  }
  if (all_valid) return false;

  Context *ctx = current_context(scanner);

#ifdef TREE_SITTER_DEBUG
  fprintf(stderr, "SCAN: stack_size=%d, ctx_type=%d, lookahead=%c(%d), valid=[",
    (int)scanner->stack.size,
    ctx ? ctx->type : -1,
    lexer->lookahead > 31 ? (char)lexer->lookahead : '?',
    lexer->lookahead);
  for (int i = 0; i < 17; i++) {
    if (valid_symbols[i]) fprintf(stderr, "%d,", i);
  }
  fprintf(stderr, "]\n");
#endif

  // =========================================================================
  // INTERPOLATION END: closing } when inside interpolation
  // =========================================================================
  if (valid_symbols[INTERPOLATION_END] && ctx && ctx->type == CTX_INTERPOLATION) {
    if (lexer->lookahead == '}') {
      advance(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = INTERPOLATION_END;
      pop_context(scanner);
      return true;
    }
  }

  // =========================================================================
  // Inside a STRING context
  // =========================================================================
  if (ctx && ctx->type == CTX_STRING) {
    // STRING_END: closing "
    if (valid_symbols[STRING_END] && lexer->lookahead == '"') {
      advance(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = STRING_END;
      pop_context(scanner);
      return true;
    }

    // INTERPOLATION_START: #{
    if (valid_symbols[INTERPOLATION_START] && lexer->lookahead == '#') {
      advance(lexer);
      if (lexer->lookahead == '{') {
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = INTERPOLATION_START;
        push_context(scanner, CTX_INTERPOLATION);
        return true;
      }
      // Not interpolation, fall through to content
    }

    // STRING_CONTENT: text between delimiters
    if (valid_symbols[STRING_CONTENT]) {
      lexer->result_symbol = STRING_CONTENT;
      if (scan_string_content(lexer)) {
        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // Inside a COMMAND context
  // =========================================================================
  if (ctx && ctx->type == CTX_COMMAND) {
    if (valid_symbols[COMMAND_END] && lexer->lookahead == '`') {
      advance(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = COMMAND_END;
      pop_context(scanner);
      return true;
    }

    if (valid_symbols[INTERPOLATION_START] && lexer->lookahead == '#') {
      advance(lexer);
      if (lexer->lookahead == '{') {
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = INTERPOLATION_START;
        push_context(scanner, CTX_INTERPOLATION);
        return true;
      }
    }

    if (valid_symbols[COMMAND_CONTENT]) {
      lexer->result_symbol = COMMAND_CONTENT;
      if (scan_command_content(lexer)) {
        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // Inside a REGEX context
  // =========================================================================
  if (ctx && ctx->type == CTX_REGEX) {
    if (valid_symbols[REGEX_END] && lexer->lookahead == '/') {
      advance(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = REGEX_END;
      pop_context(scanner);
      return true;
    }

    if (valid_symbols[INTERPOLATION_START] && lexer->lookahead == '#') {
      advance(lexer);
      if (lexer->lookahead == '{') {
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = INTERPOLATION_START;
        push_context(scanner, CTX_INTERPOLATION);
        return true;
      }
    }

    if (valid_symbols[REGEX_CONTENT]) {
      lexer->result_symbol = REGEX_CONTENT;
      if (scan_regex_content(lexer)) {
        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // Inside a HEREDOC context
  // =========================================================================
  if (ctx && ctx->type == CTX_HEREDOC) {
    // Check for HEREDOC_END: identifier at start of line
    if (valid_symbols[HEREDOC_END]) {
      // Skip whitespace at start of line
      while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        advance(lexer);
      }

      bool match = true;
      for (uint8_t i = 0; i < scanner->heredoc_id_len; i++) {
        if (lexer->eof(lexer) || (char)lexer->lookahead != scanner->heredoc_id[i]) {
          match = false;
          break;
        }
        advance(lexer);
      }

      if (match && (lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == '\r')) {
        lexer->mark_end(lexer);
        lexer->result_symbol = HEREDOC_END;
        pop_context(scanner);
        scanner->heredoc_id_len = 0;
        return true;
      }
    }

    // INTERPOLATION_START inside heredoc
    if (valid_symbols[INTERPOLATION_START] && lexer->lookahead == '#') {
      advance(lexer);
      if (lexer->lookahead == '{') {
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = INTERPOLATION_START;
        push_context(scanner, CTX_INTERPOLATION);
        return true;
      }
    }

    // HEREDOC_CONTENT
    if (valid_symbols[HEREDOC_CONTENT]) {
      lexer->result_symbol = HEREDOC_CONTENT;
      if (scan_heredoc_content(scanner, lexer)) {
        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // Inside a PERCENT LITERAL context
  // =========================================================================
  if (ctx && (ctx->type == CTX_PERCENT_STRING || ctx->type == CTX_PERCENT_RAW ||
              ctx->type == CTX_PERCENT_WORDS || ctx->type == CTX_PERCENT_SYMBOLS ||
              ctx->type == CTX_PERCENT_REGEX || ctx->type == CTX_PERCENT_COMMAND)) {
    // PERCENT_LITERAL_END: closing delimiter
    if (valid_symbols[PERCENT_LITERAL_END] && lexer->lookahead == ctx->close_delimiter && ctx->nesting_depth == 0) {
      advance(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = PERCENT_LITERAL_END;
      pop_context(scanner);
      return true;
    }

    // INTERPOLATION_START inside percent literal
    if (valid_symbols[INTERPOLATION_START] && context_supports_interpolation(ctx->type) && lexer->lookahead == '#') {
      advance(lexer);
      if (lexer->lookahead == '{') {
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = INTERPOLATION_START;
        push_context(scanner, CTX_INTERPOLATION);
        return true;
      }
    }

    // PERCENT_LITERAL_CONTENT
    if (valid_symbols[PERCENT_LITERAL_CONTENT]) {
      lexer->result_symbol = PERCENT_LITERAL_CONTENT;
      if (scan_percent_content(scanner, lexer)) {
        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // TOP LEVEL: Starting new string/regex/heredoc/percent/command
  // =========================================================================

  // Skip whitespace for top-level token scanning
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
         lexer->lookahead == '\r' || lexer->lookahead == '\n') {
    skip(lexer);
  }

  // STRING_START: opening "
  if (valid_symbols[STRING_START] && lexer->lookahead == '"') {
    advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = STRING_START;
    push_context(scanner, CTX_STRING);
    return true;
  }

  // COMMAND_START: opening `
  if (valid_symbols[COMMAND_START] && lexer->lookahead == '`') {
    advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = COMMAND_START;
    push_context(scanner, CTX_COMMAND);
    return true;
  }

  // HEREDOC_START: <<-IDENT or <<~IDENT
  if (valid_symbols[HEREDOC_START] && lexer->lookahead == '<') {
    advance(lexer);
    if (lexer->lookahead == '<') {
      advance(lexer);
      bool indent = false;
      if (lexer->lookahead == '-') {
        advance(lexer);
      } else if (lexer->lookahead == '~') {
        advance(lexer);
        indent = true;
      }

      // Read the identifier
      if (is_identifier_start(lexer->lookahead)) {
        scanner->heredoc_id_len = 0;
        scanner->heredoc_indent = indent;
        while (is_identifier_char(lexer->lookahead) && scanner->heredoc_id_len < MAX_HEREDOC_ID - 1) {
          scanner->heredoc_id[scanner->heredoc_id_len++] = (char)lexer->lookahead;
          advance(lexer);
        }
        lexer->mark_end(lexer);
        lexer->result_symbol = HEREDOC_START;
        push_context(scanner, CTX_HEREDOC);
        return true;
      }
    }
    // Not a heredoc — this was `<<` or `<` which should be handled by grammar
    return false;
  }

  // REGEX_START: opening / (disambiguated from division)
  // We look at context to decide. After an expression (identifier, number, `)`, `]`, `}`),
  // `/` is division. Otherwise it's a regex.
  if (valid_symbols[REGEX_START] && lexer->lookahead == '/') {
    // We need to figure out if this is regex or division.
    // The grammar will only have REGEX_START valid when it could be a regex position.
    // We trust the valid_symbols check.
    advance(lexer);

    // Check it's not `//` (floor division) or `/=` (division assign)
    if (lexer->lookahead == '/' || lexer->lookahead == '=') {
      return false;
    }

    lexer->mark_end(lexer);
    lexer->result_symbol = REGEX_START;
    push_context(scanner, CTX_REGEX);
    return true;
  }

  // PERCENT_LITERAL_START: %w(...), %i(...), %q(...), %Q(...), %r(...), %x(...), %(...)
  if (valid_symbols[PERCENT_LITERAL_START] && lexer->lookahead == '%') {
    advance(lexer);

    enum ContextType pct_type = CTX_PERCENT_STRING;

    switch (lexer->lookahead) {
      case 'w': pct_type = CTX_PERCENT_WORDS;   advance(lexer); break;
      case 'i': pct_type = CTX_PERCENT_SYMBOLS;  advance(lexer); break;
      case 'q': pct_type = CTX_PERCENT_RAW;      advance(lexer); break;
      case 'Q': pct_type = CTX_PERCENT_STRING;   advance(lexer); break;
      case 'r': pct_type = CTX_PERCENT_REGEX;    advance(lexer); break;
      case 'x': pct_type = CTX_PERCENT_COMMAND;  advance(lexer); break;
      case '(': case '[': case '{': case '<': case '|':
        pct_type = CTX_PERCENT_STRING; // bare %(...) is interpolated string
        break;
      default:
        return false; // Not a percent literal (could be % operator)
    }

    int32_t open = lexer->lookahead;
    int32_t close = matching_delimiter(open);

    // Must have a delimiter
    if (open != '(' && open != '[' && open != '{' && open != '<' && open != '|') {
      return false;
    }

    advance(lexer); // consume opening delimiter
    lexer->mark_end(lexer);
    lexer->result_symbol = PERCENT_LITERAL_START;

    Context ctx = {
      .type = pct_type,
      .open_delimiter = open,
      .close_delimiter = close,
      .nesting_depth = 0,
    };
    array_push(&scanner->stack, ctx);
    return true;
  }

  return false;
}
