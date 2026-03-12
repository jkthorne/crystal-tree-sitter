# Crystal Tree-Sitter Grammar: Plan

## Current State (Post Phase E partial) — 222 tests passing

| File | Errors | Rate | Notes |
|------|--------|------|-------|
| array.cr (2269 lines) | 30 | 1.3% | splat in index, `!` at EOL |
| hash.cr (2300) | 41 | 1.7% | down from 76 (proc types, ivar access) |
| enumerable.cr (2350) | 49 | 2.0% | `.method` in when, `!` at EOL |
| json/builder.cr (452) | 12 | 2.6% | no-paren calls |
| string.cr (5896) | 200 | 3.3% | cascading from `{% %}` |
| int.cr (2864) | 195 | 6.8% | cascading from `{% %}` |

Most remaining errors in string.cr/int.cr cascade from unparsed `{% for %}` / `{% if %}` macro control blocks.

### Phase E Improvements Made

- **Parenthesized proc types:** `(K -> V)?`, `(self, K -> V)?` — fixed hash.cr cascade
- **Instance variable access through receiver:** `other.@block` — fixed hash.cr errors
- **Multi-value return/break/next/yield:** `return entry, index` — fixed hash.cr, array.cr
- **forall clause:** Extracted as named rule with proper precedence
- **Splat in block params:** `|*kv|` — fixed enumerable.cr errors
- **Metaclass type:** `Foo.class` in type positions
- **Query updates:** forall_clause, metaclass_type, dot ivar access highlights; enum/case scopes
- **CI script:** `scripts/check-error-rates.sh` with per-file thresholds

## Open Gaps

### Needs External Scanner

| Gap | Example | Why |
|-----|---------|-----|
| Named tuple literals | `{name: "foo"}` | Disambiguate `{` from block/hash |
| Symbol in no-paren calls | `puts :flush` | `:` lexed as type annotation |
| `x.not_nil!` at EOL | `!` suffix on dot call | `!` tokenized as operator at EOL |
| String line continuation | `"hello " \<newline>"world"` | Scanner change |
| Implicit object in when | `when .>(5)` | `.method` parsed as ERROR |

### Grammar Only

| Gap | Notes |
|-----|-------|
| Error recovery | Parser cascades instead of recovering; `prec.dynamic` + error tokens at statement boundaries |
| No-paren call precedence | Greedy parsing eats binary expressions; hardest grammar problem |
| Splat in index expression | `self[*foo(x)]` — blocked by no-paren call precedence |

## Phase E: Production Polish (remaining)

1. Error recovery — strategic error tokens at statement boundaries
2. No-paren call precedence — may need external scanner context
3. Test corpus expansion — target 300+ tests (currently 222)
4. Fuzz testing

## Phase F: Advanced Features

1. Full macro body parsing — parse Crystal inside `{{ }}`
2. C binding improvements — callback types, variadic functions
3. Concurrency — `select`/`when` for channels
4. Editor integration testing — Neovim, Helix, Zed, VS Code

## Targets

| Milestone | Non-macro error rate | Macro error rate | Tests |
|-----------|---------------------|-----------------|-------|
| Phase D | ~1.3% | ~2.5-6.8% | 197 |
| Current (Phase E partial) | ~1.3-2.0% | ~3.3-6.8% | 222 |
| Phase E complete | <0.5% | <2% | 300+ |
| Phase F | <0.1% | <0.5% | 500+ |

## Testing

```sh
# Automated error-rate check with thresholds
./scripts/check-error-rates.sh --download

# Manual: download and parse
for f in string int array json/builder enumerable hash; do
  curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/$f.cr" > "/tmp/crystal_$(basename $f).cr"
done
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
- **Parenthesized proc types:** `(Type, Type -> Type)` form added in Phase E with GLR conflict resolution for comma-separated type contexts.
- **Metaclass type:** `Type.class` added with conflict entries for uninitialized_expression, array_literal, fun_def, type_def, hash_literal.
- **forall_clause:** Extracted as named rule with `prec.right(1)` to win over no-paren call interpretation.
