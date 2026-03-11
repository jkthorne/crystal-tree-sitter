; Class definitions
(class_def
  name: (type_name
    (constant) @name)) @definition.class

(struct_def
  name: (type_name
    (constant) @name)) @definition.class

; Module definitions
(module_def
  name: (type_name
    (constant) @name)) @definition.module

; Enum definitions
(enum_def
  name: (constant) @name) @definition.class

; Method definitions
(method_def
  name: (identifier) @name) @definition.method

; Annotation definitions
(annotation_def
  name: (constant) @name) @definition.class

; Method calls
(call
  method: (identifier) @name) @reference.call

(dot_expression
  method: (identifier) @name) @reference.call
