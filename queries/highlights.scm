; Keywords
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

; Safe navigation
"&." @operator

; Short block
(short_block
  method: (identifier) @function.method.call)
(short_block
  method: (method_identifier) @function.method.call)

; Type declarations
(type_declaration
  name: (identifier) @variable)
(type_declaration
  type: (type) @type)

; Generic instances
(generic_instance
  (constant) @type)

; Literals
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

; Comments
(comment) @comment

; Method identifiers (foo?, save!) used as expressions
(method_identifier) @function.call

; Variables
(identifier) @variable
(instance_variable) @variable.member
(class_variable) @variable.member
(global_variable) @variable.builtin
(constant) @type

; Self
(self) @variable.builtin

; Method definitions
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

; Method calls
(call
  method: (identifier) @function.call)
(call
  method: (method_identifier) @function.call)
(dot_expression
  method: (identifier) @function.method.call)
(dot_expression
  method: (method_identifier) @function.method.call)
(dot_expression
  method: (constant) @type)

; Scoped constants
(scoped_constant
  (constant) @type)
(scoped_type_name
  (constant) @type)

; Parameters
(param
  name: (identifier) @variable.parameter)
(block_param
  (identifier) @variable.parameter)

; Enum members
(enum_member
  (constant) @constant)

; Annotations
(annotation
  (constant) @attribute)

; Types in signatures
(generic_type
  (constant) @type)
(scoped_type
  (constant) @type)

; Operators
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
  "=>"
  "->"
] @operator

; Punctuation
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," "." ":" "::" ";"] @punctuation.delimiter

; Require path
(require_statement
  (string_literal) @string.special.path)

; Named arguments
(named_argument
  name: (identifier) @variable.parameter)

; Visibility modifiers
(visibility_modifier
  ["private" "protected"] @keyword.modifier)
