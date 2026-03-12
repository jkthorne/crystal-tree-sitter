# Crystal Tree-Sitter Grammar: Production Readiness Plan

## Current State: Alpha (v0.1.0)

- **129 tests, 100% passing** — but tests cover happy paths only
- **Real-world parsing: ~85-90% error rate** on Crystal stdlib files (`string.cr`: 742 errors in 5896 lines)
- The grammar handles isolated statements well but fails on common Crystal patterns used in real code

## Critical Gaps (Blocking Production Use)

### Tier 1 — Fundamental Syntax Failures

| # | Gap | Impact | Example |
|---|-----|--------|---------|
| 1 | **Scoped constant expressions** | `Foo::Bar` as expression parses `::Bar` as symbol literal | `JSON::Builder`, `HTTP::Client` |
| 2 | **Scoped class/module/struct/enum names** | `class Foo::Bar` fails entirely | Nearly every stdlib file |
| 3 | **Method names with `?` `!` `=`** | `def foo?`, `def save!`, `def name=` all error | ~40% of Crystal methods |
| 4 | **Integer type suffixes** | `42_u8`, `1_i64` parsed as int + identifier | Common in Crystal |
| 5 | **Index assignment** | `x[0] = 1` fails | Array/Hash mutation |
| 6 | **Named tuple literals** | `{name: "foo"}` fails (colon ambiguity) | Common data pattern |
| 7 | **Identifier pattern** | `/[a-z_][a-zA-Z0-9_]*/` excludes `?` and `!` suffixes | `empty?`, `nil?`, `save!` |

### Tier 2 — Common Patterns Missing

| # | Gap | Impact | Example |
|---|-----|--------|---------|
| 8 | **Line continuation in strings** | `"hello \<newline>world"` | Multi-line strings |
| 9 | **Macro bodies** | Regex-based `/[^}]+/` — doesn't parse real Crystal inside macros | All macro-heavy code |
| 10 | **`record` macro** | Parsed as call (works accidentally) but no special AST | Common pattern |
| 11 | **`property`/`getter`/`setter`** | Same — parsed as calls (OK for now) | Every model class |
| 12 | **`||=` and `&&=`** | Need to verify these work as assignment operators | Memoization patterns |
| 13 | **Operator `[]=`** | Index assignment operator method def | Custom collections |

### Tier 3 — Production Polish

| # | Gap | Example |
|---|-----|---------|
| 14 | Error recovery | Parser cascades errors instead of recovering |
| 15 | Precedence tuning | No-paren calls eat binary expressions |
| 16 | Comprehensive test corpus | Only 129 tests vs real-world complexity |
| 17 | Highlights coverage | Missing scoped constant highlighting |
| 18 | `locals.scm` refinement | Variable scoping incomplete |
| 19 | Fuzz testing | No adversarial testing done |

## Implementation Plan

### Phase A: Fix Critical Syntax (Tier 1) — Unblocks real-world parsing

**This is the clear priority.** Fixing items 1-7 would likely drop the stdlib error rate from ~85% to ~20%. Scoped constants (`Foo::Bar`) alone would fix the majority of errors since nearly every Crystal file uses namespaced types and the entire parse tree collapses when a class definition fails.

1. **Fix identifier pattern** — Change `IDENTIFIER` to `/[a-z_][a-zA-Z0-9_]*[?!]?/` so method names with `?`/`!` work natively
2. **Add scoped constant expression** — Add `scoped_constant` rule: `seq($.constant, '::', $.constant)` (recursive) usable both in types AND expressions
3. **Fix class/module/struct/enum names** — Allow scoped names (`Foo::Bar`) in definition name position
4. **Add integer type suffixes** — Extend `integer_literal` regex to include optional `_?[uif](8|16|32|64|128)`
5. **Fix index assignment** — Add `index_expression` as valid `assignment_target`
6. **Add named tuple literals** — Requires external scanner help or careful precedence to distinguish from hash/block
7. **Add `def name=`** — Allow `identifier=` (with `=` suffix) as method name in `method_def`

### Phase B: Common Patterns (Tier 2) — Handles 90%+ of real code

8. **String line continuation** — Handle `\<newline>` in scanner's string content handling
9. **Improve macro parsing** — At minimum, properly match `{{...}}` and `{%...%}` with nesting; ideally parse Crystal expressions inside `{{...}}`
10. **Verify and fix assignment operators** — Ensure `||=`, `&&=`, `<<=`, `>>=` all work
11. **Test `[]=` operator method** — Ensure `def []=(index, value)` works

### Phase C: Production Polish (Tier 3)

12. **Add error recovery** — Use tree-sitter's `ERROR` recovery with `prec.dynamic` and strategic error tokens
13. **Fix no-paren call precedence** — This is the single hardest problem; may need external scanner help to disambiguate
14. **Expand test corpus** — Target 500+ tests covering all real-world patterns, test against Crystal stdlib
15. **Benchmark** — Parse speed should be <1ms for typical files; test memory usage
16. **Fuzz testing** — Use tree-sitter's built-in fuzzer
17. **Query polish** — Update highlights/tags/locals for new node types
18. **CI pipeline** — Automated testing against Crystal stdlib files with error-rate targets

### Phase D: Advanced Features

19. **Macro refinement** — Full macro body parsing (may need separate parse mode)
20. **C binding improvements** — Callback types, variadic functions
21. **Concurrency** — `select`/`when` for channels (basic version works but needs testing)
22. **Editor integration testing** — Neovim, Helix, Zed, VS Code

## Validation Targets

| Milestone | Stdlib Error Rate | Test Count |
|-----------|------------------|------------|
| Phase A complete | <20% | 200+ |
| Phase B complete | <5% | 350+ |
| Phase C complete | <1% | 500+ |
| Phase D complete | <0.5% | 500+ |

## Testing Methodology

Parse these Crystal stdlib files and track error counts as a regression benchmark:

```sh
# Download test files
curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/string.cr" > /tmp/crystal_string.cr
curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/int.cr" > /tmp/crystal_int.cr
curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/array.cr" > /tmp/crystal_array.cr
curl -sL "https://raw.githubusercontent.com/crystal-lang/crystal/master/src/json/builder.cr" > /tmp/crystal_json.cr

# Baseline (2026-03-11, before Phase A)
# string.cr:  5896 lines, 742 errors
# int.cr:     2864 lines, 254 errors
# array.cr:   2269 lines, 232 errors
# json/builder.cr: 452 lines, 46 errors

# After Phase A (2026-03-11)
# string.cr:  5896 lines, 231 errors  (-69%)
# int.cr:     2864 lines, 228 errors  (-10%)
# array.cr:   2269 lines, 115 errors  (-50%)
# json/builder.cr: 452 lines, 13 errors (-72%)
# Test count: 159 (was 129)

# After Phase B (2026-03-11)
# string.cr:  5896 lines, 183 errors  (-21% from A, -75% from baseline)
# int.cr:     2864 lines, 200 errors  (-12% from A, -21% from baseline)
# array.cr:   2269 lines, 36 errors   (-69% from A, -84% from baseline)
# json/builder.cr: 452 lines, 13 errors (unchanged)
# Test count: 175 (was 159)
```

## Phase A Implementation Notes

### Completed
1. **Scoped constant expressions** — Added `scoped_constant` rule for `Foo::Bar` in expression context
2. **Scoped class/module/struct/enum names** — Added `scoped_type_name` and `_type_identifier` rules
3. **Method names with `?` and `!`** — Added `method_identifier` token and `_method_name` rule
4. **Setter method names (`=`)** — Added `setter_method_name` token, used in `_def_name`
5. **Integer type suffixes** — Extended `integer_literal` with `[iu](8|16|32|64|128)`
6. **Index assignment** — Added `index_expression` and `dot_expression` to `assignment_target`
7. **Arrow proc types** — Added `Type -> Type` and `-> Type` syntax to `proc_type`
8. **Anonymous block types** — `& : IO ->` now works in block_param_def
9. **Yield with expression** — `yield @value` now works
10. **Symbol suffixes** — `:foo?`, `:bar!`, `:name=` symbols now parse
11. **When with dot method** — `.nan?` in when clauses works
12. **Out arguments** — `out x` in function calls
13. **Scoped PREC level** — Added SCOPE=19 precedence

### Deferred to Phase B
- **Named tuple literals** — `{name: "foo"}` causes cascading conflicts with blocks/hash/tuple.
  Needs external scanner support to disambiguate `{` contexts.

### Known remaining issues (pre-existing)
- **Symbol in no-paren calls** — `puts :flush` fails because `:` is lexed separately.
  Needs external scanner to distinguish `:symbol` from `:` (type annotation).

## Phase B Implementation Notes

### Completed
1. **Wrapping operators** — Added `&+`, `&-`, `&*`, `&**` to binary_expression, operator_assignment, and operator_method_def
2. **Wrapping assignment operators** — Added `&+=`, `&-=`, `&*=`, `&**=`
3. **Private/protected constants** — Added assignment and type_declaration to visibility_modifier choices
4. **Private/protected enums** — Added enum_def to visibility_modifier
5. **Top-level macro statements** — Added `macro_control_statement` (`{% ... %}`) and `macro_expression_statement` (`{{ ... }}`) as opaque tokens at statement level
6. **Macro body fix** — Fixed `macro_body` regex swallowing `end` keyword, allowing macros inside class/module definitions
7. **offsetof with instance variables** — Extended offsetof_expression to accept instance_variable
8. **Macro `%` in content** — Fixed regex to allow `%` inside `{% %}` and `}` inside `{{ }}` blocks

### Design Decision: Opaque Macro Tokens
The `{% %}` and `{{ }}` blocks are parsed as opaque single tokens rather than structured AST nodes. This avoids lexer conflicts between `{% if %}` (structured) vs `{% code %}` (bare) while still allowing Crystal code between macro tags to parse correctly. The trade-off is that the macro control flow structure (if/else/end) isn't captured in the tree.

### Remaining bottleneck: `{{ }}` inside expressions
The dominant remaining error source is `{{ }}` used within expressions (e.g., `{{@type}}::MIN`, `to_unsigned_info({{unsigned_int_class}})`). As opaque tokens, these can't participate in expression context. This causes cascading parse failures — a single `{{ }}` inside an expression collapses the entire enclosing class/method definition. Fixing this requires external scanner support (Phase C/D).

### Error analysis
- **string.cr**: File-wide ERROR persists due to `{{ table.splat }}` at line 552
- **int.cr**: File-wide ERROR from `{{@type}}::MIN` at line 151
- **array.cr**: Most errors fixed; remaining are localized (36 errors in 2269 lines = 1.6%)
- **json/builder.cr**: Unchanged (13 errors, mostly from `{{ }}` in expressions)
