# Crystal Tree-Sitter Grammar: Plan

## Current State (Post Phase D) — 197 tests passing

| File | Errors | Rate | Notes |
|------|--------|------|-------|
| array.cr (2269 lines) | 30 | 1.3% | |
| enumerable.cr (2350) | 58 | 2.5% | |
| json/builder.cr (452) | 12 | 2.7% | |
| string.cr (5896) | 178 | 3.0% | cascading from `{% %}` |
| hash.cr (2300) | 76 | 3.3% | |
| int.cr (2864) | 196 | 6.8% | cascading from `{% %}` |

Most remaining errors in string.cr/int.cr cascade from unparsed `{% for %}` / `{% if %}` macro control blocks.

## Open Gaps

### Needs External Scanner

| Gap | Example | Why |
|-----|---------|-----|
| Named tuple literals | `{name: "foo"}` | Disambiguate `{` from block/hash |
| Symbol in no-paren calls | `puts :flush` | `:` lexed as type annotation |
| `x.not_nil!` at EOL | `!` suffix on dot call | `!` tokenized as operator at EOL |
| String line continuation | `"hello " \<newline>"world"` | Scanner change |
| Multi-arg proc types | `T, T -> U` | Only single-arg arrow works |

### Grammar Only

| Gap | Notes |
|-----|-------|
| Error recovery | Parser cascades instead of recovering; `prec.dynamic` + error tokens at statement boundaries |
| No-paren call precedence | Greedy parsing eats binary expressions; hardest grammar problem |

## Phase E: Production Polish

1. Error recovery — strategic error tokens at statement boundaries
2. No-paren call precedence — may need external scanner context
3. Test corpus expansion — target 300+ tests
4. Fuzz testing
5. Query completeness — highlights/tags/locals for every node type
6. CI pipeline — automated stdlib parsing with error-rate regression targets

## Phase F: Advanced Features

1. Full macro body parsing — parse Crystal inside `{{ }}`
2. C binding improvements — callback types, variadic functions
3. Concurrency — `select`/`when` for channels
4. Editor integration testing — Neovim, Helix, Zed, VS Code

## Targets

| Milestone | Non-macro error rate | Macro error rate | Tests |
|-----------|---------------------|-----------------|-------|
| Current (Phase D) | ~1.3% | ~2.5-6.8% | 197 |
| Phase E | <0.5% | <2% | 300+ |
| Phase F | <0.1% | <0.5% | 500+ |

## Testing

```sh
# Download stdlib test files
for f in string int array json/builder enumerable hash; do
  curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/$f.cr" > "/tmp/crystal_$(basename $f).cr"
done

# Parse and count errors
for f in /tmp/crystal_*.cr; do
  lines=$(wc -l < "$f")
  errors=$(npx tree-sitter parse "$f" 2>&1 | grep -c "ERROR\|MISSING")
  echo "$(basename $f): $lines lines, $errors errors"
done
```

## Design Decisions

- **Opaque macro tokens:** `{% %}` and `{{ }}` are opaque single tokens from the external scanner. `{{ }}` participates in expressions (added to `primary` rule in Phase D). `{% %}` control flow is not in the AST — this is the main source of cascading errors.
- **Named tuples deferred:** `{name: "foo"}` conflicts with block/hash/tuple syntax without external scanner disambiguation.
- **Symbol in no-paren calls deferred:** `puts :symbol` fails because `:` is lexed as type annotation separator.
