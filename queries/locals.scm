; Local variable scoping queries for Crystal.
;
; These queries define scope boundaries, variable definitions, and references
; for features like rename-symbol and highlight-references in editors.
;
; @local.scope    — creates a new scope boundary
; @local.definition — marks where a variable is defined (first assignment)
; @local.reference  — marks where a variable is used

; ---------------------------------------------------------------------------
; Scope boundaries
; ---------------------------------------------------------------------------
; Each of these constructs creates a new lexical scope. Variables defined
; inside are not visible outside.

(method_def) @local.scope
(class_def) @local.scope
(struct_def) @local.scope
(module_def) @local.scope
(enum_def) @local.scope
(block) @local.scope
(if_expression) @local.scope
(unless_expression) @local.scope
(while_expression) @local.scope
(until_expression) @local.scope
(case_expression) @local.scope
(begin_expression) @local.scope

; ---------------------------------------------------------------------------
; Variable definitions
; ---------------------------------------------------------------------------
; Local variables are defined by assignment (first occurrence in scope)
; and by parameter declarations.

; Assignment: x = 42
(assignment
  (assignment_target
    (identifier) @local.definition))

; Method parameters: def foo(x, y) — x and y are definitions
(param
  name: (identifier) @local.definition)

; Block parameters: foo do |x| — x is a definition
(block_param
  (identifier) @local.definition)

; ---------------------------------------------------------------------------
; Variable references
; ---------------------------------------------------------------------------
; Any identifier usage is a potential reference to a previously defined local.

(identifier) @local.reference
