# Crystal Tree-Sitter Grammar: Plan

## Current State (Phase E complete) — 227 tests passing

| File | Errors | Rate | Threshold | Notes |
|------|--------|------|-----------|-------|
| array.cr (2269 lines) | 27 | 1.1% | 1.5% | `!` at EOL remains |
| hash.cr (2300) | 37 | 1.6% | 2.0% | down from 76 |
| enumerable.cr (2350) | 41 | 1.7% | 2.0% | down from 49 |
| json/builder.cr (452) | 11 | 2.4% | 2.5% | no-paren calls |
| string.cr (5896) | 197 | 3.3% | 3.5% | macro-heavy, was 200 |
| int.cr (2864) | 198 | 6.9% | 7.0% | macro-heavy, was 195 |

### Phase E Improvements

- **Scanner all-valid guard:** Returns `false` during error recovery (all `valid_symbols` true), preventing cascading failures from spurious scanner contexts. Single highest-impact change.
- **Macro control as extras:** `{% %}` moved to `extras` array so it's handled like comments — can appear anywhere between tokens without parse errors.
- **Splat in index expression:** `self[*foo(x)]`, `arr[*a, *b]` — fixed array.cr errors.
- **Implicit object operators in when:** `when .is_a?(Type)`, `when .>(5)` — fixed enumerable.cr errors.
- **Parenthesized proc types:** `(K -> V)?`, `(self, K -> V)?` — fixed hash.cr cascade.
- **Instance variable access through receiver:** `other.@block` — fixed hash.cr errors.
- **Multi-value return/break/next/yield:** `return entry, index` — fixed hash.cr, array.cr.
- **forall clause:** Extracted as named rule with proper precedence.
- **Splat in block params:** `|*kv|` — fixed enumerable.cr errors.
- **Metaclass type:** `Foo.class` in type positions.
- **Query updates:** forall_clause, metaclass_type, dot ivar access highlights; enum/case scopes.
- **CI script:** `scripts/check-error-rates.sh` with tightened per-file thresholds.
- **Fuzz test script:** `scripts/fuzz-test.sh` for broad stdlib parsing validation.

## Open Gaps

### Needs External Scanner

| Gap | Example | Why |
|-----|---------|-----|
| Named tuple literals | `{name: "foo"}` | Disambiguate `{` from block/hash |
| Symbol in no-paren calls | `puts :flush` | `:` lexed as type annotation |
| `x.not_nil!` at EOL | `!` suffix on dot call | `!` tokenized as operator at EOL |
| String line continuation | `"hello " \<newline>"world"` | Scanner change |

### Grammar Only

| Gap | Notes |
|-----|-------|
| Error recovery | Parser cascades instead of recovering; `prec.dynamic` + error tokens at statement boundaries |
| No-paren call precedence | Greedy parsing eats binary expressions; hardest grammar problem |

## Phase F: Advanced Features

1. Error recovery — strategic error tokens at statement boundaries
2. No-paren call precedence — may need external scanner context
3. Full macro body parsing — parse Crystal inside `{{ }}`
4. C binding improvements — callback types, variadic functions
5. Concurrency — `select`/`when` for channels
6. Editor integration testing — Neovim, Helix, Zed, VS Code

## Targets

| Milestone | Non-macro error rate | Macro error rate | Tests |
|-----------|---------------------|-----------------|-------|
| Phase D | ~1.3% | ~2.5-6.8% | 197 |
| Phase E partial | ~1.3-2.0% | ~3.3-6.8% | 222 |
| **Phase E complete** | **~1.1-2.4%** | **~3.3-6.9%** | **227** |
| Phase F | <0.5% | <2% | 300+ |

## Testing

```sh
# Automated error-rate check with thresholds
./scripts/check-error-rates.sh --download

# Fuzz test against full stdlib
./scripts/fuzz-test.sh --download --threshold 5.0

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

- **Opaque macro tokens:** `{% %}` and `{{ }}` are opaque single tokens. `{{ }}` participates in expressions (added to `primary` rule in Phase D). `{% %}` is now in `extras` so it can appear anywhere between tokens without causing parse errors.
- **Scanner error recovery guard:** The external scanner returns `false` when all `valid_symbols` are true (error recovery mode), preventing spurious context creation that caused cascading failures.
- **Named tuples deferred:** `{name: "foo"}` conflicts with block/hash/tuple syntax without external scanner disambiguation.
- **Symbol in no-paren calls deferred:** `puts :symbol` fails because `:` is lexed as type annotation separator.
- **Parenthesized proc types:** `(Type, Type -> Type)` form added in Phase E with GLR conflict resolution for comma-separated type contexts.
- **Metaclass type:** `Type.class` added with conflict entries for uninitialized_expression, array_literal, fun_def, type_def, hash_literal.
- **forall_clause:** Extracted as named rule with `prec.right(1)` to win over no-paren call interpretation.
