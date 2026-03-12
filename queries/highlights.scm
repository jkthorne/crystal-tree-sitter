; Syntax highlighting queries for Crystal.
;
; These queries map AST nodes to highlight capture names used by editors
; (Neovim, Helix, Zed, etc.) for syntax coloring. Capture names follow
; the tree-sitter highlight convention: @keyword, @function, @type, etc.
;
; Ordering matters: later rules take priority over earlier ones for the
; same node. More specific patterns (e.g., method_def name) should appear
; after general patterns (e.g., all identifiers) to override them.

; ---------------------------------------------------------------------------
; Keywords
; ---------------------------------------------------------------------------
[
  "abstract"
  "alias"
  "annotation"
  "begin"
  "break"
  "case"
  "class"
  "def"
  "do"
  "else"
  "elsif"
  "end"
  "ensure"
  "enum"
  "extend"
  "forall"
  "fun"
  "if"
  "include"
  "lib"
  "macro"
  "module"
  "next"
  "of"
  "out"
  "private"
  "protected"
  "require"
  "rescue"
  "return"
  "spawn"
  "struct"
  "then"
  "type"
  "typeof"
  "union"
  "unless"
  "until"
  "when"
  "while"
  "yield"
  "uninitialized"
] @keyword

; ---------------------------------------------------------------------------
; Operators and punctuation
; ---------------------------------------------------------------------------

; Safe navigation operator (&.)
"&." @operator

; Short block syntax: &.method_name
(short_block
  method: (identifier) @function.method.call)
(short_block
  method: (method_identifier) @function.method.call)

; Arithmetic, comparison, logical, bitwise, assignment, and range operators
[
  "+"
  "-"
  "*"
  "/"
  "//"
  "%"
  "**"
  "=="
  "!="
  "<"
  ">"
  "<="
  ">="
  "<=>"
  "==="
  "=~"
  "!~"
  "&&"
  "||"
  "!"
  "&"
  "|"
  "^"
  "~"
  "<<"
  ">>"
  ".."
  "..."
  "="
  "+="
  "-="
  "*="
  "/="
  "%="
  "&+"
  "&-"
  "&*"
  "&**"
  "=>"
  "->"
] @operator

; Brackets and delimiters
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," "." ":" "::" ";"] @punctuation.delimiter

; ---------------------------------------------------------------------------
; Literals
; ---------------------------------------------------------------------------
(nil_literal) @constant.builtin
(bool_literal) @boolean
(integer_literal) @number
(float_literal) @number.float
(char_literal) @character
(string_literal) @string
(string_content) @string
(escape_sequence) @string.escape
(string_interpolation) @embedded
(interpolation_start) @punctuation.special
(interpolation_end) @punctuation.special
(symbol_literal) @string.special.symbol
(regex_literal) @string.regexp
(regex_content) @string.regexp
(regex_flags) @string.regexp
(command_literal) @string.special
(command_content) @string.special
(heredoc_literal) @string
(heredoc_content) @string
(percent_literal) @string
(percent_literal_content) @string

; ---------------------------------------------------------------------------
; Comments
; ---------------------------------------------------------------------------
(comment) @comment

; ---------------------------------------------------------------------------
; Variables and identifiers
; ---------------------------------------------------------------------------

; Method identifiers with ? or ! suffix used as expressions (e.g., empty?, save!)
(method_identifier) @function.call

; General identifiers — this is a catch-all; more specific rules below override
(identifier) @variable
(instance_variable) @variable.member
(class_variable) @variable.member
(global_variable) @variable.builtin
(constant) @type

; Self keyword
(self) @variable.builtin

; ---------------------------------------------------------------------------
; Type declarations
; ---------------------------------------------------------------------------
(type_declaration
  name: (identifier) @variable)
(type_declaration
  type: (type) @type)

; Generic type instances (e.g., Array(Int32))
(generic_instance
  (constant) @type)

; ---------------------------------------------------------------------------
; Method definitions
; ---------------------------------------------------------------------------
(method_def
  name: (identifier) @function.method)
(method_def
  name: (method_identifier) @function.method)
(method_def
  name: (setter_method_name) @function.method)
(abstract_def
  name: (identifier) @function.method)
(abstract_def
  name: (method_identifier) @function.method)
(abstract_def
  name: (setter_method_name) @function.method)

; ---------------------------------------------------------------------------
; Method calls
; ---------------------------------------------------------------------------

; Direct calls: method_name(args) or method_name args
(call
  method: (identifier) @function.call)
(call
  method: (method_identifier) @function.call)

; Dot calls: receiver.method(args)
(dot_expression
  method: (identifier) @function.method.call)
(dot_expression
  method: (method_identifier) @function.method.call)
(dot_expression
  method: (constant) @type)

; ---------------------------------------------------------------------------
; Types and constants
; ---------------------------------------------------------------------------

; Scoped constants: Foo::Bar, ::Foo
(scoped_constant
  (constant) @type)
(scoped_type_name
  (constant) @type)

; Types in generic signatures and scoped types
(generic_type
  (constant) @type)
(scoped_type
  (constant) @type)

; ---------------------------------------------------------------------------
; Parameters
; ---------------------------------------------------------------------------
(param
  external_name: (identifier) @variable.parameter)
(param
  name: (identifier) @variable.parameter)
(block_param
  (identifier) @variable.parameter)

; Named arguments in calls: foo(name: value)
(named_argument
  name: (identifier) @variable.parameter)

; ---------------------------------------------------------------------------
; Enum members
; ---------------------------------------------------------------------------
(enum_member
  (constant) @constant)

; ---------------------------------------------------------------------------
; Annotations
; ---------------------------------------------------------------------------
(annotation
  (constant) @attribute)

; ---------------------------------------------------------------------------
; Require paths
; ---------------------------------------------------------------------------
(require_statement
  (string_literal) @string.special.path)

; ---------------------------------------------------------------------------
; Visibility modifiers
; ---------------------------------------------------------------------------
(visibility_modifier
  ["private" "protected"] @keyword.modifier)

; ---------------------------------------------------------------------------
; Macro constructs
; ---------------------------------------------------------------------------

; {% ... %} control tags (if, for, end, etc.)
(macro_control_statement) @keyword.directive

; {{ ... }} expression interpolation (in both statement and expression context)
(macro_expression_statement) @keyword.directive

; ---------------------------------------------------------------------------
; Type-related expressions
; ---------------------------------------------------------------------------

; forall clause: def foo forall T, U
(forall_clause
  (constant) @type)

; Metaclass type: Foo.class
(metaclass_type
  "class" @keyword)

; Instance variable access through receiver: other.@block
(dot_expression
  method: (instance_variable) @variable.member)
