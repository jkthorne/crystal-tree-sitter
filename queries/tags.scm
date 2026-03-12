; Tags queries for Crystal — used for code navigation (symbol outline, go-to-definition).
;
; Definitions (@definition.*) mark where symbols are declared.
; References (@reference.*) mark where symbols are used.
; The @name capture identifies the symbol's display name.

; ---------------------------------------------------------------------------
; Class, struct, and enum definitions
; ---------------------------------------------------------------------------

; class Foo ... end
(class_def
  name: (type_name
    (constant) @name)) @definition.class

; struct Bar ... end
(struct_def
  name: (type_name
    (constant) @name)) @definition.class

; enum Color ... end
(enum_def
  name: (constant) @name) @definition.class

; annotation MyAnnotation ... end
(annotation_def
  name: (constant) @name) @definition.class

; ---------------------------------------------------------------------------
; Module definitions
; ---------------------------------------------------------------------------

; module Foo ... end
(module_def
  name: (type_name
    (constant) @name)) @definition.module

; ---------------------------------------------------------------------------
; Method definitions
; ---------------------------------------------------------------------------

; def method_name ... end
(method_def
  name: (identifier) @name) @definition.method

; def method_name? / def method_name! ... end
(method_def
  name: (method_identifier) @name) @definition.method

; ---------------------------------------------------------------------------
; Method references (calls)
; ---------------------------------------------------------------------------

; Direct calls: method_name(args) or method_name args
(call
  method: (identifier) @name) @reference.call

; Dot calls: receiver.method_name(args)
(dot_expression
  method: (identifier) @name) @reference.call
