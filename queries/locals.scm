; Scopes
(method_def) @local.scope
(class_def) @local.scope
(struct_def) @local.scope
(module_def) @local.scope
(block) @local.scope
(if_expression) @local.scope
(unless_expression) @local.scope
(while_expression) @local.scope
(until_expression) @local.scope
(begin_expression) @local.scope

; Definitions
(assignment
  (assignment_target
    (identifier) @local.definition))

(param
  name: (identifier) @local.definition)

(block_param
  (identifier) @local.definition)

; References
(identifier) @local.reference
