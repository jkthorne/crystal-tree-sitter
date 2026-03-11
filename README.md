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
- **Macros** — basic macro definitions, `{{interpolation}}`, `{% control %}`
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

73 tests across 6 corpus files, 100% passing:

| File | Tests | Coverage |
|------|-------|----------|
| `advanced.txt` | 22 | Safe navigation, ternary, generics, procs, type checks, C bindings |
| `basics.txt` | 12 | Literals, variables, assignments, method calls |
| `classes.txt` | 6 | Classes, structs, modules, enums |
| `control_flow.txt` | 7 | if/unless/case/while, exceptions, return |
| `methods.txt` | 7 | Definitions, params, visibility, blocks, splat |
| `strings.txt` | 19 | Interpolation, escapes, heredocs, percent literals, regex, commands |

## Project Structure

```
tree-sitter-crystal/
  grammar.js            # Grammar definition (~1130 rules)
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
- Macro support is basic (no `macro for`, `macro if`, or complex macro bodies)
- Named tuples in literals are not yet supported (ambiguous with blocks/hashes without additional scanner work)

## License

MIT — Jack Thorne <jack@myrenee.io>
