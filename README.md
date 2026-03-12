# tree-sitter-crystal

A [Tree-sitter](https://tree-sitter.github.io/) grammar for the [Crystal](https://crystal-lang.org/) programming language.

## Features

### Language Support

- **Literals** — integers, floats, booleans, nil, chars, strings, symbols, arrays, hashes, tuples, regex, heredocs, percent literals, command literals
- **Strings** — double-quoted with `#{}` interpolation, escape sequences (`\n`, `\t`, `\xHH`, `\uHHHH`, `\u{...}`, octal), heredocs (`<<-ID`, `<<~ID`), percent literals (`%q`, `%Q`, `%()`)
- **Regex** — `/pattern/flags` with interpolation, `%r()` percent regex with flags
- **Variables** — local, instance (`@`), class (`@@`), global (`$`), constants
- **Assignments** — simple, operator (`+=`, `-=`, etc.), multiple assignment (`a, b = 1, 2`)
- **Methods** — definitions with typed params, return types, splat/double-splat, block params, abstract methods, operator overloads
- **Calls** — with/without parens, blocks (`do...end`, `{...}`), short block syntax (`&.method`)
- **Types** — classes, structs, modules, enums (with generics, inheritance, abstract)
- **Control flow** — `if`/`elsif`/`else`, `unless`, `case`/`when`, `while`, `until`, modifier forms
- **Exceptions** — `begin`/`rescue`/`ensure` with typed rescue params
- **Type system** — annotations, union types, nilable types, pointer types, static arrays, proc types, generic types, `typeof`, `is_a?`, `as`, `responds_to?`, `nil?`
- **Annotations** — `@[Name]`, `@[Scoped::Name]`
- **Visibility** — `private`, `protected`
- **Macros** — macro definitions, `{{ }}` interpolation in both statement and expression context (e.g., `{{@type}}::MIN`, `{{x}}.method`), `{% %}` control tags
- **C bindings** — `lib`, `fun`, `struct`, `union`, `type`, `alias`
- **Proc literals** — `->{ ... }` syntax
- **Special** — `spawn`, `typeof`, `sizeof`, `instance_sizeof`, `pointerof`, `offsetof`, `uninitialized`

### Queries

| File | Purpose |
|------|---------|
| `queries/highlights.scm` | Syntax highlighting (44 keywords, all literal types, operators, variables, types) |
| `queries/tags.scm` | Code navigation (class, module, enum, method definitions and references) |
| `queries/locals.scm` | Variable scoping (scope boundaries, definitions, references) |

### External Scanner

A C-based external scanner (`src/scanner.c`) handles context-sensitive lexing:

- String interpolation (`"hello #{name}"`) with proper nesting
- Heredocs (`<<-HEREDOC`, `<<~HEREDOC`) with interpolation
- Regex literals (`/pattern/flags`) disambiguated from division
- Percent literals (`%w()`, `%i()`, `%q()`, `%Q()`, `%r()`, `%x()`, `%()`) with balanced delimiter tracking
- Command literals (`` `echo #{cmd}` ``) with interpolation
- Escape sequences parsed as distinct nodes for accurate highlighting
- Context stack with serialization for incremental parsing

## Usage

```bash
npm install
npx tree-sitter generate
npx tree-sitter test
npx tree-sitter parse path/to/file.cr
npx tree-sitter highlight path/to/file.cr
```

## Test Suite

197 tests across 10 corpus files, 100% passing:

| File | Tests | Coverage |
|------|-------|----------|
| `advanced.txt` | 22 | Safe navigation, ternary, generics, procs, type checks, C bindings |
| `basics.txt` | 12 | Literals, variables, assignments, method calls |
| `classes.txt` | 6 | Classes, structs, modules, enums |
| `control_flow.txt` | 7 | if/unless/case/while, exceptions, return |
| `methods.txt` | 7 | Definitions, params, visibility, blocks, splat |
| `strings.txt` | 19 | Interpolation, escapes, heredocs, percent literals, regex, commands |
| `phase_a.txt` | 39 | Scoped constants, method identifiers, type suffixes, proc types |
| `phase_b.txt` | 29 | Wrapping operators, macro statements, visibility modifiers |
| `phase_c.txt` | 45 | Forall, return if, external params, union types, global scope |
| `phase_d.txt` | 11 | Macro `{{ }}` in expression contexts |

## Project Structure

```
tree-sitter-crystal/
  grammar.js            # Grammar definition (~1250 rules)
  src/scanner.c         # External scanner for strings/regex/heredocs
  src/grammar.json      # Generated grammar (JSON)
  src/node-types.json   # Generated node types
  queries/
    highlights.scm      # Syntax highlighting
    tags.scm            # Code navigation
    locals.scm          # Variable scoping
  test/corpus/          # Test cases
  examples/             # Sample Crystal files
```

## Bindings

Binding support is configured for C, Node, Rust, Go, Python, and Swift via `tree-sitter.json`. Generate bindings with `tree-sitter generate`.

## Known Limitations

- No-paren method calls can be ambiguous with binary expressions (e.g., `a + b` may parse as a call instead of addition)
- Macro `{% %}` control blocks are opaque tokens (no `macro for`, `macro if` AST structure)
- Macro `{{ }}` content is opaque (not parsed as Crystal expressions)
- Named tuples in literals are not yet supported (ambiguous with blocks/hashes without additional scanner work)
- Identifier concatenation in macros (`value{{i}}`) produces two adjacent nodes rather than a single identifier

## License

MIT — Jack Thorne <jack@myrenee.io>
