# Crystal Tree-Sitter Grammar: Production Readiness Plan

## Current State: Alpha (v0.2.0) — Post Phase A+B

- **175 tests, 100% passing**
- **Real-world parsing:** array.cr at 1.6% error rate, but macro-heavy files (string.cr, int.cr) still have cascading failures from `{{ }}` inside expressions
- Phases A and B are complete. The grammar handles most Crystal syntax correctly in isolation. The remaining gaps fall into two categories: (1) macro interpolation in expression context, and (2) a dozen missing syntax patterns that are individually small but collectively account for most remaining errors in macro-free code.

## Benchmark Results

| File | Lines | Baseline | Post-A | Post-B | Error Rate |
|------|-------|----------|--------|--------|------------|
| string.cr | 5896 | 742 | 231 | 183 | 3.1% (but file-wide ERROR from `{{ }}`) |
| int.cr | 2864 | 254 | 228 | 200 | 7.0% (but file-wide ERROR from `{{ }}`) |
| array.cr | 2269 | 232 | 115 | 36 | 1.6% |
| json/builder.cr | 452 | 46 | 13 | 13 | 2.9% |
| enumerable.cr | 2350 | — | — | 80 | 3.4% (file-wide ERROR from `forall`) |
| hash.cr | 2300 | — | — | 77 | 3.3% |

**Note:** The "error rate" numbers for string.cr, int.cr, and enumerable.cr are misleading — these files have a single file-wide `ERROR` node wrapping most of the tree because one early syntax failure cascades. The actual number of _root cause_ errors is much smaller. Fixing the cascading triggers would dramatically reduce error counts.

## Remaining Gaps

### Tier 1 — Cascading Error Triggers

These cause file-wide `ERROR` nodes that swallow hundreds of lines of otherwise-valid code. Fixing these has outsized impact.

| # | Gap | Trigger | Files Affected |
|---|-----|---------|----------------|
| 1 | **`{{ }}` in expression context** | `{{@type}}::MIN`, `{{ table.splat }}` | string.cr, int.cr, json/builder.cr |
| 2 | **`forall` clause** | `def foo(x : T) forall T` | enumerable.cr, hash.cr |
| 3 | **`return`/`break`/`next` with modifier `if`/`unless`** | `return if x != 0` | array.cr, enumerable.cr |

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

### Phase C: Fix Cascading Triggers + Common Patterns

**Goal:** Eliminate file-wide `ERROR` nodes and fix the most common localized errors. This should bring all benchmark files below 1% error rate (excluding macro interpolation inside expressions, which needs Phase D).

**Priority order** (by impact, easiest first):

1. **`forall` clause** — Add `forall` keyword + type variable list to `method_def` and `abstract_def`. Pure grammar change, no scanner work.

2. **`return`/`break`/`next` + modifier `if`/`unless`** — These jump statements don't currently support trailing `if`/`unless` modifiers. Need to allow `_expression_with_modifier` or similar in their production rules.

3. **External parameter names** — Allow an optional leading identifier as external name in method params: `def foo(external_name internal_name : Type)`. Grammar-only change to param rule.

4. **3+ union types** — The union type rule likely isn't properly recursive. Fix to `repeat1(seq('|', type))` or similar so `A | B | C | D` works.

5. **Global scope `::` prefix** — Add `::` as valid prefix for method calls and constant references. Need `::constant` and `::identifier(args)` patterns.

6. **`yield *splat`** — Allow `*` (splat) before yield arguments.

7. **`x.not_nil!`** — The `!` suffix on method identifiers after `.` needs to be recognized in dot_expression method position.

8. **String line continuation** — Handle backslash-newline in scanner's string content. Scanner change.

9. **Named tuple literals** — Requires external scanner to disambiguate `{name:` (named tuple) from `{` (block/hash). This is the hardest item in this phase.

10. **Symbol in no-paren calls** — External scanner to distinguish `:symbol` from `:` (type annotation) based on preceding context.

11. **Semicolons in do blocks** — Ensure `;` works as statement terminator inside do blocks.

### Phase D: Macro Interpolation in Expressions

**Goal:** Make `{{ }}` work inside expression context so `{{@type}}::MIN` and `foo({{bar}})` parse correctly.

**Approach:** This requires external scanner support. The scanner needs to:
- Recognize `{{` inside expression context (not just at statement level)
- Emit it as a token that can participate in expressions
- Handle the content opaquely (or parse Crystal inside)
- Recognize `}}` and resume normal expression parsing

This is architecturally the hardest remaining problem because `{{ }}` needs to act as an expression placeholder that can appear anywhere a constant/identifier/expression could.

**Options:**
- **Option A: Macro expression as primary** — Make `{{ ... }}` a valid `primary` expression so it composes naturally. The scanner emits `MACRO_EXPR_START`/`MACRO_EXPR_END` tokens. Grammar wraps content as opaque.
- **Option B: Two-pass parsing** — Pre-process files to replace `{{ }}` with placeholder identifiers, parse, then map back. Simpler but requires tooling wrapper.
- **Option C: Accept limitation** — Document that macro-heavy files parse with errors. Focus on making non-macro code perfect.

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
| Phase B complete (current) | ~1.6% (array.cr) | ~3-7% (cascading) | 175 |
| Phase C complete | <0.5% | ~2-5% (macro `{{ }}` only) | 300+ |
| Phase D complete | <0.5% | <1% | 400+ |
| Phase E complete | <0.1% | <0.5% | 500+ |

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

| Date | Phase | string.cr | int.cr | array.cr | json/builder.cr |
|------|-------|-----------|--------|----------|-----------------|
| 2026-03-11 | Baseline | 742 errors | 254 errors | 232 errors | 46 errors |
| 2026-03-11 | Post-A | 231 (-69%) | 228 (-10%) | 115 (-50%) | 13 (-72%) |
| 2026-03-11 | Post-B | 183 (-75%) | 200 (-21%) | 36 (-84%) | 13 (-72%) |

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

### Design Decisions

- **Opaque macro tokens:** `{% %}` and `{{ }}` at statement level are opaque single tokens. This avoids lexer conflicts but means macro control flow isn't in the AST. The key remaining problem is that `{{ }}` can't participate in expression context.
- **Named tuples deferred:** `{name: "foo"}` causes cascading conflicts with blocks/hash/tuple syntax. Needs external scanner to disambiguate `{` context.
- **Symbol in no-paren calls deferred:** `puts :symbol` fails because `:` is lexed as type annotation separator. Needs external scanner context.
