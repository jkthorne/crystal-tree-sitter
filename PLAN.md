# Crystal Tree-Sitter Grammar: Production Readiness Plan

## Current State: Alpha (v0.2.0) — Post Phase A+B+C+D

- **197 tests, 100% passing**
- **Real-world parsing:** array.cr at 1.3% error rate, macro-heavy files improved (enumerable.cr down 24%)
- Phases A, B, C, and D are complete. Macro `{{ }}` now works in expression context (dot calls, scoped constants, arguments, binary ops). The remaining gaps are: (1) cascading errors from `{% %}` control flow blocks, and (2) a handful of missing syntax patterns (named tuples, symbol in no-paren calls, `!` method suffix at EOL).

## Benchmark Results

| File | Lines | Baseline | Post-A | Post-B | Post-C | Post-D | Error Rate |
|------|-------|----------|--------|--------|--------|--------|------------|
| string.cr | 5896 | 742 | 231 | 183 | 191 | 178 | 3.0% (cascading from `{% %}`) |
| int.cr | 2864 | 254 | 228 | 200 | 200 | 196 | 6.8% (cascading from `{% %}`) |
| array.cr | 2269 | 232 | 115 | 36 | 30 | 30 | 1.3% |
| json/builder.cr | 452 | 46 | 13 | 13 | 12 | 12 | 2.7% |
| enumerable.cr | 2350 | — | — | 80 | 76 | 58 | 2.5% (improved from `{{ }}` fix) |
| hash.cr | 2300 | — | — | 77 | 76 | 76 | 3.3% |

**Note:** The "error rate" numbers for string.cr and int.cr are still affected by cascading errors from `{% %}` macro control blocks. The `{{ }}` expression fix (Phase D) helped enumerable.cr significantly (-24%). The remaining cascading errors are from `{% for %}` / `{% if %}` blocks that create ERROR nodes which swallow surrounding code.

## Remaining Gaps

### Tier 1 — Cascading Error Triggers

These cause file-wide `ERROR` nodes that swallow hundreds of lines of otherwise-valid code. Fixing these has outsized impact.

| # | Gap | Trigger | Files Affected | Status |
|---|-----|---------|----------------|--------|
| 1 | **`{{ }}` in expression context** | `{{@type}}::MIN`, `{{ table.splat }}` | string.cr, int.cr, json/builder.cr | ✅ Phase D |
| 2 | **`forall` clause** | `def foo(x : T) forall T` | enumerable.cr, hash.cr | ✅ Phase C |
| 3 | **`return`/`break`/`next` with modifier `if`/`unless`** | `return if x != 0` | array.cr, enumerable.cr | ✅ Phase C |

### Tier 2 — Common Syntax Patterns

These produce localized errors. Each is straightforward to fix but they appear frequently.

| # | Gap | Example | Impact |
|---|-----|---------|--------|
| 4 | **External parameter names** | `def foo(from start : Int)` | Method signatures in stdlib |
| 5 | **3+ union types in params** | `x : Array \| Slice \| StaticArray` | Only 2-way unions work |
| 6 | **Global scope prefix** | `::raise "error"` | Error handling in stdlib |
| 7 | **`yield *splat`** | `yield *tuple` | Iterator patterns |
| 8 | **Named tuple literals** | `{name: "foo"}` | Deferred from Phase A |
| 9 | **Symbol in no-paren calls** | `puts :flush` | `:` lexed as type annotation |
| 10 | **String line continuation** | `"hello " \<newline>"world"` | Multi-line strings |
| 11 | **`x.not_nil!`** | `!` method suffix on dot call | Common pattern |
| 12 | **Semicolons in do blocks** | `foo do; end` (single-line) | Minor edge case |

### Tier 3 — Production Polish

| # | Gap |
|---|-----|
| 13 | Error recovery — parser cascades errors instead of recovering |
| 14 | No-paren call precedence — greedy parsing eats binary expressions |
| 15 | Expand test corpus to 500+ |
| 16 | Fuzz testing |
| 17 | Query polish (highlights/tags/locals for all node types) |
| 18 | CI pipeline with stdlib error-rate regression targets |

## Implementation Plan

### Phase C: Fix Cascading Triggers + Common Patterns (Complete)

**Results:** array.cr errors reduced from 36 to 30. Fixes for `forall`, `return if`, `::raise`, `yield *splat`, external params, standalone keyword types, and 3+ union types.

**Completed:**

1. ✅ **`forall` clause on `abstract_def`** — Was already on `method_def`; added to `abstract_def`.
2. ✅ **`return`/`break`/`next` + modifier `if`/`unless`** — Added explicit `return if expr` / `return unless expr` alternatives to prevent `return` from consuming `if_expression` as its value.
3. ✅ **External parameter names** — Added optional `external_name` field to `_simple_param`: `def foo(from start : Int)`.
4. ✅ **3+ union types** — Binary `union_type` already chains via left-associativity. The real issue was that `StaticArray`, `Proc`, and `NamedTuple` keywords couldn't be used as standalone type constants. Fixed with `alias` in `type` rule.
5. ✅ **Global scope `::` prefix** — Added `::constant` to `scoped_constant` and `::method(args)` to `call`.
6. ✅ **`yield *splat`** — Added `seq('*', $.expression)` to `yield_expression`.
7. ✅ **Semicolons in do blocks** — Already worked (`;` was already in `_terminator`).

**Deferred to Phase D/E:**

8. **`x.save!` at end of line** — Tree-sitter lexer limitation: `!` after identifier at EOL is tokenized as a separate `!` operator instead of being included in `method_identifier`. Works fine when `!(` follows (e.g., `x.save!(y)`). Adding an external scanner token for this breaks case/when parsing due to tree-sitter external token side effects.
9. **Named tuple literals** — Needs external scanner to disambiguate `{name:` from block/hash.
10. **Symbol in no-paren calls** — Needs external scanner context.
11. **String line continuation** — Scanner change, low frequency.
12. **Multi-arg proc types** — `T, T -> U` in block type annotations not supported (only single-arg arrow form works).

### Phase D: Macro Interpolation in Expressions (Complete)

**Results:** enumerable.cr errors reduced from 76 to 58 (-24%). string.cr reduced from 191 to 178 (-7%). int.cr reduced from 200 to 196.

**Approach:** Pure grammar change — no external scanner needed. Added `macro_expression_statement` (the existing opaque `{{ ... }}` token) to the `primary` rule so it can participate in all expression contexts naturally.

**Completed:**

1. ✅ **`{{ }}` as primary expression** — Added to `primary` rule, removed from `macro_statement` (now flows through expression → statement automatically).
2. ✅ **`{{@type}}::MIN`** — Updated `scoped_constant` to accept `macro_expression_statement` as LHS of `::`.
3. ✅ **`{{type}}(Int32)`** — Updated `generic_instance` to accept `macro_expression_statement` as base.
4. ✅ **`{{x}}.method`** — Works automatically since `dot_expression` takes `$.expression` as receiver.
5. ✅ **`{{x}}[i]`** — Works automatically since `index_expression` takes `$.expression` as receiver.
6. ✅ **`foo({{bar}})`** — Works automatically through argument → expression → primary.
7. ✅ **`x > {{max}}`** — Works automatically through binary_expression.

**Design decision:** Content inside `{{ }}` remains opaque (not parsed as Crystal). Full macro body parsing deferred to Phase F.

### Phase E: Production Polish

1. **Error recovery** — Add tree-sitter error recovery with `prec.dynamic` and strategic error tokens at statement boundaries
2. **No-paren call precedence** — Hardest grammar problem; may need external scanner context
3. **Test corpus expansion** — Target 500+ tests, including all patterns from stdlib
4. **Fuzz testing** — tree-sitter's built-in fuzzer
5. **Benchmark** — Parse speed <1ms for typical files
6. **Query completeness** — highlights/tags/locals for every node type
7. **CI pipeline** — Automated stdlib parsing with error-rate regression targets

### Phase F: Advanced Features

1. **Full macro body parsing** — Parse Crystal expressions inside `{{ }}`
2. **C binding improvements** — Callback types, variadic functions
3. **Concurrency** — `select`/`when` for channels
4. **Editor integration testing** — Neovim, Helix, Zed, VS Code

## Validation Targets

| Milestone | Stdlib Error Rate (non-macro files) | Stdlib Error Rate (macro files) | Test Count |
|-----------|-------------------------------------|--------------------------------|------------|
| Phase B complete | ~1.6% (array.cr) | ~3-7% (cascading) | 175 |
| Phase C complete | ~1.3% (array.cr) | ~3-7% (cascading) | 186 |
| Phase D complete (current) | ~1.3% (array.cr) | ~2.5-6.8% (cascading from `{% %}`) | 197 |
| Phase E complete | <0.5% | <2% | 300+ |
| Phase F complete | <0.1% | <0.5% | 500+ |

## Testing Methodology

```sh
# Download test files
curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/string.cr" > /tmp/crystal_string.cr
curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/int.cr" > /tmp/crystal_int.cr
curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/array.cr" > /tmp/crystal_array.cr
curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/json/builder.cr" > /tmp/crystal_json.cr
curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/enumerable.cr" > /tmp/crystal_enumerable.cr
curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/hash.cr" > /tmp/crystal_hash.cr

# Parse and count errors
for f in /tmp/crystal_*.cr; do
  lines=$(wc -l < "$f")
  errors=$(npx tree-sitter parse "$f" 2>&1 | grep -c "ERROR\|MISSING")
  echo "$(basename $f): $lines lines, $errors errors"
done
```

### Historical Results

| Date | Phase | string.cr | int.cr | array.cr | json/builder.cr | enumerable.cr | hash.cr |
|------|-------|-----------|--------|----------|-----------------|---------------|---------|
| 2026-03-11 | Baseline | 742 errors | 254 errors | 232 errors | 46 errors | — | — |
| 2026-03-11 | Post-A | 231 (-69%) | 228 (-10%) | 115 (-50%) | 13 (-72%) | — | — |
| 2026-03-11 | Post-B | 183 (-75%) | 200 (-21%) | 36 (-84%) | 13 (-72%) | 80 | 77 |
| 2026-03-12 | Post-C | 191 (-74%) | 200 (-21%) | 30 (-87%) | 12 (-74%) | 76 | 76 |
| 2026-03-12 | Post-D | 178 (-76%) | 196 (-23%) | 30 (-87%) | 12 (-74%) | 58 (-28%) | 76 |

## Completed Phase Notes

### Phase A: Critical Syntax (Complete)

1. Scoped constant expressions (`Foo::Bar`)
2. Scoped class/module/struct/enum names
3. Method names with `?` and `!` (method_identifier token)
4. Setter method names (`def name=`)
5. Integer type suffixes (`42_u8`, `1_i64`)
6. Index assignment (`x[0] = 1`)
7. Arrow proc types (`Type -> Type`)
8. Anonymous block types (`& : IO ->`)
9. Yield with expression (`yield @value`)
10. Symbol suffixes (`:foo?`, `:bar!`, `:name=`)
11. When with dot method (`.nan?` in case/when)
12. Out arguments (`out x`)
13. Scoped PREC level (SCOPE=19)

### Phase B: Common Patterns (Complete)

1. Wrapping operators (`&+`, `&-`, `&*`, `&**`)
2. Wrapping assignment operators (`&+=`, `&-=`, `&*=`, `&**=`)
3. Private/protected constants and enums
4. Top-level macro statements (`{% %}`, `{{ }}` as opaque tokens)
5. Macro body fix (regex no longer swallows `end`)
6. offsetof with instance variables
7. Macro `%` in content fix

### Phase C: Common Patterns (Complete)

1. `forall` clause on `abstract_def`
2. `return`/`break`/`next` with modifier `if`/`unless`
3. External parameter names (`def foo(from start : Int)`)
4. Standalone keyword type constants (`StaticArray`, `Proc`, `NamedTuple` as type aliases)
5. Global scope `::` prefix for constants and calls
6. `yield *splat`
7. Semicolons in do blocks (already worked)

### Phase D: Macro Interpolation in Expressions (Complete)

1. `{{ }}` as primary expression — moved from statement-only to `primary` rule
2. `{{@type}}::MIN` — `scoped_constant` accepts `macro_expression_statement` as LHS
3. `{{type}}(Int32)` — `generic_instance` accepts `macro_expression_statement` as base
4. Dot/index/binary/argument contexts — work automatically through expression composability
5. No external scanner changes needed — pure grammar approach using existing opaque token

### Design Decisions

- **Opaque macro tokens:** `{% %}` and `{{ }}` at statement level are opaque single tokens. This avoids lexer conflicts but means macro control flow isn't in the AST. The key remaining problem is that `{{ }}` can't participate in expression context.
- **Named tuples deferred:** `{name: "foo"}` causes cascading conflicts with blocks/hash/tuple syntax. Needs external scanner to disambiguate `{` context.
- **Symbol in no-paren calls deferred:** `puts :symbol` fails because `:` is lexed as type annotation separator. Needs external scanner context.
