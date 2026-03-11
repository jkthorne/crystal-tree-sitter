# tree-sitter-crystal

A [Tree-sitter](https://tree-sitter.github.io/) grammar for the [Crystal](https://crystal-lang.org/) programming language.

## Status

**Work in progress** — Phases 1-4 implemented:

- Literals (integers, floats, booleans, strings, symbols, chars, arrays, hashes, tuples, regex)
- Variables (local, instance, class, global, constants)
- Assignments and operator assignments
- Method definitions (params, types, return types, splat, double splat, block params)
- Method calls (with/without parens, blocks)
- Classes, structs, modules, enums (with generics, inheritance)
- Control flow (if/elsif/else, unless, case/when, while, until)
- Exception handling (begin/rescue/ensure)
- Type annotations and union types
- Annotations, visibility modifiers
- Macros (basic)
- C bindings (lib, fun, struct, union)
- Syntax highlighting queries

### Known Limitations

- String interpolation (`#{}`) is not yet supported (requires external scanner)
- Heredocs not yet supported
- Percent literals (`%w()`, `%i()`, etc.) not yet supported
- Binary expressions without parentheses can be ambiguous with no-paren method calls
  (e.g., `a + b` may parse as `call a (+b)` instead of `binary a + b`)

## Usage

```bash
npm install
npx tree-sitter generate
npx tree-sitter test
npx tree-sitter parse path/to/file.cr
npx tree-sitter highlight path/to/file.cr
```

## License

MIT
