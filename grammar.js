/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Operator precedence levels (higher = tighter binding)
const PREC = {
  ASSIGN: 1,
  CONDITIONAL: 2,    // ? :
  RANGE: 3,          // .. ...
  OR: 4,             // ||
  AND: 5,            // &&
  NOT: 6,            // !
  COMPARE: 7,        // == != < > <= >= <=> === =~ !~
  BIT_OR: 8,         // |
  BIT_XOR: 9,        // ^
  BIT_AND: 10,       // &
  SHIFT: 11,         // << >>
  ADD: 12,           // + -
  MULTIPLY: 13,      // * / // %
  UNARY: 14,         // - + ~ typeof sizeof
  POWER: 15,         // **
  CALL: 16,          // method calls
  INDEX: 17,         // []
  DOT: 18,           // .
  SCOPE: 19,         // ::
};

const IDENTIFIER = /[a-z_][a-zA-Z0-9_]*/;
const METHOD_IDENTIFIER = /[a-z_][a-zA-Z0-9_]*[?!]/;
const SETTER_IDENTIFIER = /[a-z_][a-zA-Z0-9_]*=/;
const CONSTANT = /[A-Z][a-zA-Z0-9_]*/;

module.exports = grammar({
  name: 'crystal',

  extras: $ => [
    /\s/,
    $.comment,
  ],

  externals: $ => [
    $._string_start,
    $.string_content,
    $._string_end,
    $.interpolation_start,
    $.interpolation_end,
    $._heredoc_start,
    $.heredoc_content,
    $._heredoc_end,
    $._regex_start,
    $.regex_content,
    $._regex_end,
    $._command_start,
    $.command_content,
    $._command_end,
    $._percent_literal_start,
    $.percent_literal_content,
    $._percent_literal_end,
  ],

  word: $ => $.identifier,

  conflicts: $ => [
    [$.fun_def],
    [$.argument, $.parenthesized_expression],
    [$.assignment_target, $.primary],
    [$.primary, $._method_name],
    [$._method_name, $.named_argument, $.primary],
    [$._method_name, $.named_argument],
    [$.assignment, $.multiple_assignment],
    [$.expression, $.assignment_target],
    [$.visibility_modifier, $.primary],
    [$.visibility_modifier, $.expression],
  ],

  supertypes: $ => [
    $.statement,
    $.expression,
    $.literal,
  ],

  rules: {
    // =========================================================================
    // TOP LEVEL
    // =========================================================================
    source_file: $ => optional($._statements),

    _statements: $ => seq(
      repeat($._terminator),
      $.statement,
      repeat(seq($._terminator, optional($.statement))),
    ),

    // Body block used inside class/module/method/etc definitions
    _body: $ => seq(
      $._terminator,
      optional($._statements),
    ),

    statement: $ => choice(
      $.expression,
      $.require_statement,
      $.include_statement,
      $.extend_statement,
      $.return_statement,
      $.break_statement,
      $.next_statement,
      $.raise_statement,
      $.yield_expression,
      $.alias_statement,
      $.visibility_modifier,
      $.multiple_assignment,
      $.type_declaration,
      $.macro_statement,
    ),

    _terminator: $ => choice('\n', ';'),

    // =========================================================================
    // REQUIRE / INCLUDE / EXTEND
    // =========================================================================
    require_statement: $ => seq('require', $.string_literal),

    include_statement: $ => seq('include', $.type),

    extend_statement: $ => seq('extend', $.type),

    // =========================================================================
    // EXPRESSIONS
    // =========================================================================
    expression: $ => choice(
      $.assignment,
      $.operator_assignment,
      $.binary_expression,
      $.unary_expression,
      $.conditional_expression,
      $.range_expression,
      $.not_nil_expression,
      $.call,
      $.index_expression,
      $.dot_expression,
      $.primary,
      $.if_expression,
      $.unless_expression,
      $.case_expression,
      $.while_expression,
      $.until_expression,
      $.begin_expression,
      $.class_def,
      $.struct_def,
      $.module_def,
      $.enum_def,
      $.method_def,
      $.abstract_def,
      $.macro_def,
      $.annotation_def,
      $.lib_def,
      $.fun_def,
      $.type_def,
      $.annotation,
      $.spawn_expression,
      $.typeof_expression,
      $.sizeof_expression,
      $.instance_sizeof_expression,
      $.pointerof_expression,
      $.offsetof_expression,
      $.is_a_expression,
      $.as_expression,
      $.as_question_expression,
      $.responds_to_expression,
      $.nil_question_expression,
      $.modifier_if,
      $.modifier_unless,
      $.modifier_while,
      $.modifier_until,
      $.modifier_rescue,
      $.uninitialized_expression,
    ),

    // =========================================================================
    // ASSIGNMENTS
    // =========================================================================
    assignment: $ => prec.right(PREC.ASSIGN, seq(
      $.assignment_target,
      '=',
      $.expression,
    )),

    operator_assignment: $ => prec.right(PREC.ASSIGN, seq(
      $.assignment_target,
      choice('+=', '-=', '*=', '/=', '//=', '%=', '|=', '&=', '^=', '**=', '<<=', '>>=', '||=', '&&=', '&+=', '&-=', '&*=', '&**='),
      $.expression,
    )),

    assignment_target: $ => choice(
      $.identifier,
      $.instance_variable,
      $.class_variable,
      $.global_variable,
      $.constant,
      $.index_expression,
      $.dot_expression,
    ),

    multiple_assignment: $ => prec.right(PREC.ASSIGN, seq(
      $.assignment_target,
      ',',
      commaSep1($.assignment_target),
      '=',
      commaSep1($.expression),
    )),

    // =========================================================================
    // BINARY EXPRESSIONS
    // =========================================================================
    binary_expression: $ => {
      const table = [
        [PREC.OR, '||'],
        [PREC.AND, '&&'],
        [PREC.COMPARE, choice('==', '!=', '<', '>', '<=', '>=', '<=>', '===', '=~', '!~')],
        [PREC.BIT_OR, '|'],
        [PREC.BIT_XOR, '^'],
        [PREC.BIT_AND, '&'],
        [PREC.SHIFT, choice('<<', '>>')],
        [PREC.ADD, choice('+', '-', '&+', '&-')],
        [PREC.MULTIPLY, choice('*', '/', '//', '%', '&*')],
        [PREC.POWER, choice('**', '&**')],
      ];

      return choice(
        ...table.map(([prec_val, op]) =>
          prec.left(/** @type {number} */ (prec_val), seq(
            field('left', $.expression),
            field('operator', /** @type {any} */ (op)),
            field('right', $.expression),
          ))
        ),
      );
    },

    unary_expression: $ => prec(PREC.UNARY, choice(
      seq('-', $.expression),
      seq('+', $.expression),
      seq('~', $.expression),
      seq('!', $.expression),
    )),

    conditional_expression: $ => prec.right(PREC.CONDITIONAL, seq(
      field('condition', $.expression),
      '?',
      field('consequence', $.expression),
      ':',
      field('alternative', $.expression),
    )),

    range_expression: $ => prec.left(PREC.RANGE, seq(
      field('begin', $.expression),
      field('operator', choice('..', '...')),
      field('end', $.expression),
    )),

    not_nil_expression: $ => prec(PREC.DOT, seq(
      $.expression,
      '.not_nil!',
    )),

    // =========================================================================
    // CALLS & MEMBER ACCESS
    // =========================================================================
    call: $ => prec.left(PREC.CALL, choice(
      // method(args)
      seq(
        field('method', $._method_name),
        field('arguments', $.argument_list),
        optional($.block),
      ),
      // method args (no parens)
      seq(
        field('method', $._method_name),
        field('arguments', $.argument_list_no_parens),
        optional($.block),
      ),
      // method { block }
      seq(
        field('method', $._method_name),
        $.block,
      ),
      // ::method(args) — global scope call
      seq(
        '::',
        field('method', $._method_name),
        field('arguments', $.argument_list),
        optional($.block),
      ),
      // ::method args — global scope call without parens
      seq(
        '::',
        field('method', $._method_name),
        field('arguments', $.argument_list_no_parens),
        optional($.block),
      ),
    )),

    dot_expression: $ => prec.left(PREC.DOT, seq(
      field('receiver', $.expression),
      choice('.', '&.'),
      field('method', choice($._method_name, $.constant)),
      optional(field('arguments', $.argument_list)),
      optional($.block),
    )),

    index_expression: $ => prec.left(PREC.INDEX, seq(
      field('receiver', $.expression),
      '[',
      commaSep($.expression),
      ']',
      optional('?'),
    )),

    argument_list: $ => seq(
      '(',
      commaSep($.argument),
      ')',
    ),

    argument_list_no_parens: $ => prec.left(-1, seq(
      $.argument,
      repeat(seq(',', $.argument)),
    )),

    argument: $ => choice(
      $.expression,
      $.named_argument,
      $.splat_argument,
      $.double_splat_argument,
      $.block_argument,
      $.out_argument,
    ),

    named_argument: $ => seq(
      field('name', $.identifier),
      ':',
      field('value', $.expression),
    ),

    splat_argument: $ => seq('*', $.expression),

    double_splat_argument: $ => seq('**', $.expression),

    block_argument: $ => choice(
      seq('&', $.expression),
      $.short_block,
    ),

    out_argument: $ => seq('out', $.identifier),

    // Short block syntax: &.method or &.method(args)
    short_block: $ => seq(
      '&.',
      field('method', $._method_name),
      optional(field('arguments', $.argument_list)),
    ),

    // =========================================================================
    // BLOCKS
    // =========================================================================
    block: $ => choice(
      seq(
        'do',
        optional($.block_params),
        optional($._statements),
        'end',
      ),
      seq(
        '{',
        optional($.block_params),
        optional($._statements),
        '}',
      ),
    ),

    block_params: $ => seq(
      '|',
      commaSep1($.block_param),
      '|',
    ),

    block_param: $ => seq(
      $.identifier,
      optional(seq(':', $.type)),
    ),

    // =========================================================================
    // CONTROL FLOW
    // =========================================================================
    if_expression: $ => seq(
      'if',
      field('condition', $.expression),
      $.then_block,
      repeat($.elsif_clause),
      optional($.else_clause),
      'end',
    ),

    unless_expression: $ => seq(
      'unless',
      field('condition', $.expression),
      $.then_block,
      optional($.else_clause),
      'end',
    ),

    then_block: $ => choice(
      seq('then', optional($._statements)),
      seq($._terminator, optional($._statements)),
    ),

    elsif_clause: $ => seq(
      'elsif',
      field('condition', $.expression),
      $.then_block,
    ),

    else_clause: $ => seq(
      'else',
      optional($._statements),
    ),

    case_expression: $ => seq(
      'case',
      optional(field('value', $.expression)),
      $._terminator,
      repeat1($.when_clause),
      optional($.else_clause),
      'end',
    ),

    when_clause: $ => seq(
      'when',
      commaSep1($.when_value),
      $.then_block,
    ),

    when_value: $ => choice(
      $.expression,
      seq('.', $._method_name),  // implicit enum member or method
    ),

    while_expression: $ => seq(
      'while',
      field('condition', $.expression),
      $.then_block,
      'end',
    ),

    until_expression: $ => seq(
      'until',
      field('condition', $.expression),
      $.then_block,
      'end',
    ),

    // Modifiers
    modifier_if: $ => prec.left(-2, seq($.expression, 'if', $.expression)),
    modifier_unless: $ => prec.left(-2, seq($.expression, 'unless', $.expression)),
    modifier_while: $ => prec.left(-2, seq($.expression, 'while', $.expression)),
    modifier_until: $ => prec.left(-2, seq($.expression, 'until', $.expression)),
    modifier_rescue: $ => prec.left(-2, seq($.expression, 'rescue', $.expression)),

    // =========================================================================
    // EXCEPTION HANDLING
    // =========================================================================
    begin_expression: $ => seq(
      'begin',
      optional($._statements),
      repeat($.rescue_clause),
      optional($.else_clause),
      optional($.ensure_clause),
      'end',
    ),

    rescue_clause: $ => seq(
      'rescue',
      optional($.rescue_param),
      $.then_block,
    ),

    rescue_param: $ => choice(
      seq($.identifier, ':', commaSep1($.type)),
      commaSep1($.type),
      $.identifier,
    ),

    ensure_clause: $ => seq(
      'ensure',
      optional($._statements),
    ),

    // =========================================================================
    // RETURN, BREAK, NEXT, RAISE, YIELD
    // =========================================================================
    return_statement: $ => prec.left(choice(
      seq('return', optional($.expression)),
      seq('return', 'if', $.expression),
      seq('return', 'unless', $.expression),
    )),

    break_statement: $ => prec.left(choice(
      seq('break', optional($.expression)),
      seq('break', 'if', $.expression),
      seq('break', 'unless', $.expression),
    )),

    next_statement: $ => prec.left(choice(
      seq('next', optional($.expression)),
      seq('next', 'if', $.expression),
      seq('next', 'unless', $.expression),
    )),

    raise_statement: $ => prec.left(seq('raise', $.expression)),

    yield_expression: $ => prec.left(seq('yield', optional(choice(
      $.argument_list,
      seq('*', $.expression),
      $.expression,
    )))),

    // =========================================================================
    // TYPE DEFINITIONS
    // =========================================================================
    class_def: $ => seq(
      optional('abstract'),
      'class',
      field('name', $.type_name),
      optional(seq('<', field('superclass', $.type))),
      optional($._body),
      'end',
    ),

    struct_def: $ => seq(
      optional('abstract'),
      'struct',
      field('name', $.type_name),
      optional(seq('<', field('superclass', $.type))),
      optional($._body),
      'end',
    ),

    module_def: $ => seq(
      'module',
      field('name', $.type_name),
      optional($._body),
      'end',
    ),

    enum_def: $ => seq(
      'enum',
      field('name', $._type_identifier),
      optional(seq(':', field('base_type', $.type))),
      $._terminator,
      repeat(choice($.enum_member, $.method_def, $._terminator)),
      'end',
    ),

    enum_member: $ => seq(
      $.constant,
      optional(seq('=', $.expression)),
    ),

    annotation_def: $ => seq(
      'annotation',
      field('name', $.constant),
      $._terminator,
      'end',
    ),

    // =========================================================================
    // METHOD DEFINITIONS
    // =========================================================================
    method_def: $ => seq(
      'def',
      choice(
        field('name', $._def_name),
        seq('self', '.', field('name', $._def_name)),
      ),
      optional($.method_params),
      optional(seq(':', field('return_type', $.type))),
      optional(seq('forall', commaSep1($.constant))),
      optional($._body),
      'end',
    ),

    _def_name: $ => choice(
      $._method_name,
      $.setter_method_name,
      $.operator_method_def,
    ),

    abstract_def: $ => prec.left(seq(
      'abstract',
      'def',
      choice(
        field('name', $._def_name),
        seq('self', '.', field('name', $._def_name)),
      ),
      optional($.method_params),
      optional(seq(':', field('return_type', $.type))),
      optional(seq('forall', commaSep1($.constant))),
    )),

    operator_method_def: $ => choice(
      '+', '-', '*', '/', '//', '%', '**',
      '&+', '&-', '&*', '&**',
      '==', '!=', '<', '>', '<=', '>=', '<=>',
      '&', '|', '^', '~', '<<', '>>',
      '[]', '[]=', '[]?',
      '!', '=~', '!~',
    ),

    method_params: $ => seq(
      '(',
      commaSep($.param),
      ')',
    ),

    param: $ => choice(
      $._simple_param,
      $.splat_param,
      $.double_splat_param,
      $.block_param_def,
    ),

    _simple_param: $ => seq(
      optional(field('external_name', $.identifier)),
      field('name', choice($.identifier, $.instance_variable)),
      optional(seq(':', field('type', $.type))),
      optional(seq('=', field('default', $.expression))),
    ),

    splat_param: $ => seq('*', optional($.identifier)),

    double_splat_param: $ => seq('**', $.identifier, optional(seq(':', $.type))),

    block_param_def: $ => seq('&', optional(choice(
      seq($.identifier, optional(seq(':', $.type))),
      seq(':', $.type),  // anonymous block with type: & : IO ->
    ))),

    // =========================================================================
    // MACRO DEFINITIONS
    // =========================================================================
    macro_def: $ => seq(
      'macro',
      field('name', $.identifier),
      optional($.method_params),
      $._terminator,
      optional($.macro_body),
      'end',
    ),

    macro_body: $ => repeat1(choice(
      $.macro_expression,
      $.macro_control,
      $.macro_interpolation,
      $.macro_plain_text,
    )),

    // Plain text in macro body — excludes word chars so `end` keyword is not consumed
    macro_plain_text: $ => /[^{%\\a-zA-Z_]+|[a-zA-Z_][a-zA-Z0-9_]*/,

    macro_expression: $ => seq('{{', /([^}]|}[^}])+/, '}}'),

    macro_control: $ => seq('{%', /([^%]|%[^}])+/, '%}'),

    macro_interpolation: $ => seq('\\{', '{', /[^}]+/, '}', '}'),

    // =========================================================================
    // TOP-LEVEL MACRO STATEMENTS (outside macro_def)
    // =========================================================================
    // All {% ... %} and {{ ... }} blocks are opaque tokens.
    // Crystal code between them parses as regular statements.
    macro_statement: $ => $.macro_control_statement,

    // {% ... %} — opaque macro control tag (if/unless/for/begin/end/bare code)
    macro_control_statement: $ => token(seq('{%', /([^%]|%[^}])+/, '%}')),

    // {{ ... }} — macro expression interpolation
    macro_expression_statement: $ => token(seq('{{', /([^}]|}[^}])+/, '}}')),

    // =========================================================================
    // ANNOTATIONS
    // =========================================================================
    annotation: $ => seq(
      '@[',
      $._annotation_name,
      optional($.argument_list),
      ']',
    ),

    _annotation_name: $ => choice(
      $.constant,
      seq($.constant, '::', $._annotation_name),
    ),

    // =========================================================================
    // VISIBILITY
    // =========================================================================
    visibility_modifier: $ => seq(
      choice('private', 'protected'),
      choice($.method_def, $.class_def, $.struct_def, $.module_def, $.enum_def, $.constant, $.call, $.assignment, $.type_declaration),
    ),

    // =========================================================================
    // LIB / C BINDINGS
    // =========================================================================
    lib_def: $ => seq(
      'lib',
      field('name', $.constant),
      $._terminator,
      repeat(choice(
        $.fun_def,
        $.c_struct_def,
        $.union_def,
        $.type_def,
        $.enum_def,
        $.alias_statement,
        $.lib_var_decl,
        $._terminator,
      )),
      'end',
    ),

    lib_var_decl: $ => seq(
      $.global_variable,
      ':',
      $.type,
    ),

    fun_def: $ => choice(
      // Declaration only (no body)
      seq(
        'fun',
        field('name', $.identifier),
        optional(seq('=', field('real_name', $.string_literal))),
        optional($.fun_params),
        optional(seq(':', field('return_type', $.type))),
      ),
      // With body
      seq(
        'fun',
        field('name', $.identifier),
        optional(seq('=', field('real_name', $.string_literal))),
        optional($.fun_params),
        optional(seq(':', field('return_type', $.type))),
        $._terminator,
        optional($._statements),
        'end',
      ),
    ),

    fun_params: $ => seq(
      '(',
      commaSep($.fun_param),
      ')',
    ),

    fun_param: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $.type),
    ),

    c_struct_def: $ => seq(
      'struct',
      field('name', $.constant),
      optional($._body),
      'end',
    ),

    union_def: $ => seq(
      'union',
      field('name', $.constant),
      optional($._body),
      'end',
    ),

    type_def: $ => seq(
      'type',
      field('name', $.constant),
      '=',
      field('type', $.type),
    ),

    // =========================================================================
    // TYPES
    // =========================================================================
    type: $ => choice(
      $.constant,
      $.generic_type,
      $.union_type,
      $.nilable_type,
      $.pointer_type,
      $.static_array_type,
      $.proc_type,
      $.tuple_type,
      $.named_tuple_type,
      $.self_type,
      $.typeof_type,
      $.underscore_type,
      $.scoped_type,
      // These keywords are also valid as standalone type constants (e.g., in union types)
      alias('StaticArray', $.constant),
      alias('Proc', $.constant),
      alias('NamedTuple', $.constant),
    ),

    // Type name used in class/module/struct definitions — allows Foo, Foo(T), Foo::Bar, Foo::Bar(T)
    type_name: $ => prec(1, choice(
      $.constant,
      $.generic_type_def,
      $.scoped_type_name,
    )),

    // Scoped type name for definitions: Foo::Bar, Foo::Bar::Baz, Foo::Bar(T)
    scoped_type_name: $ => prec.left(1, seq(
      $._type_identifier,
      '::',
      choice($.constant, $.generic_type_def),
    )),

    // Helper: constant or scoped constant in type name position
    _type_identifier: $ => choice(
      $.constant,
      $.scoped_type_name,
    ),

    generic_type: $ => prec(1, seq(
      choice($.constant, $.scoped_constant),
      '(',
      commaSep1($.type),
      ')',
    )),

    generic_type_def: $ => prec(2, seq(
      $.constant,
      '(',
      commaSep1($.constant),
      ')',
    )),

    union_type: $ => prec.left(1, seq($.type, '|', $.type)),

    nilable_type: $ => prec(2, seq($.type, '?')),

    pointer_type: $ => prec(2, seq($.type, '*')),

    static_array_type: $ => seq(
      'StaticArray',
      '(',
      $.type,
      ',',
      $.integer_literal,
      ')',
    ),

    proc_type: $ => prec.right(choice(
      // Canonical form: Proc(Int32, String)
      seq(
        'Proc',
        '(',
        commaSep($.type),
        ')',
      ),
      // Arrow form: Int32 -> String, -> Nil
      // Single arg doesn't need parens, multi-arg uses parens
      seq($.type, '->', optional($.type)),
      // No-arg arrow form: -> Nil, ->
      seq('->', optional($.type)),
    )),

    tuple_type: $ => seq('{', commaSep1($.type), '}'),

    named_tuple_type: $ => seq(
      'NamedTuple',
      '(',
      commaSep1(seq($.identifier, ':', $.type)),
      ')',
    ),

    self_type: $ => 'self',
    typeof_type: $ => seq('typeof', '(', commaSep1($.expression), ')'),
    underscore_type: $ => '_',
    scoped_type: $ => prec(3, seq(choice($.constant, $.scoped_constant), '::', $.type)),

    // =========================================================================
    // ALIAS
    // =========================================================================
    alias_statement: $ => seq('alias', $._type_identifier, '=', $.type),

    // Type declaration: x : Int32, x : Int32 = 42
    type_declaration: $ => prec.right(PREC.ASSIGN, seq(
      field('name', choice($.identifier, $.instance_variable, $.class_variable)),
      ':',
      field('type', $.type),
      optional(seq('=', field('value', $.expression))),
    )),

    // =========================================================================
    // SPECIAL EXPRESSIONS
    // =========================================================================
    spawn_expression: $ => seq(
      'spawn',
      $.block,
    ),

    typeof_expression: $ => seq('typeof', '(', commaSep1($.expression), ')'),

    sizeof_expression: $ => seq('sizeof', '(', $.type, ')'),

    instance_sizeof_expression: $ => seq('instance_sizeof', '(', $.type, ')'),

    pointerof_expression: $ => seq('pointerof', '(', $.expression, ')'),

    offsetof_expression: $ => seq('offsetof', '(', $.type, ',', choice($.identifier, $.instance_variable), ')'),

    uninitialized_expression: $ => seq('uninitialized', $.type),

    is_a_expression: $ => prec(PREC.COMPARE, seq(
      $.expression,
      '.is_a?',
      '(',
      $.type,
      ')',
    )),

    as_expression: $ => prec(PREC.COMPARE, seq(
      $.expression,
      '.as',
      '(',
      $.type,
      ')',
    )),

    as_question_expression: $ => prec(PREC.COMPARE, seq(
      $.expression,
      '.as?',
      '(',
      $.type,
      ')',
    )),

    responds_to_expression: $ => prec(PREC.COMPARE, seq(
      $.expression,
      '.responds_to?',
      '(',
      $.symbol_literal,
      ')',
    )),

    nil_question_expression: $ => prec(PREC.DOT, seq(
      $.expression,
      '.nil?',
    )),

    // =========================================================================
    // PRIMARY EXPRESSIONS (LITERALS, VARIABLES)
    // =========================================================================
    primary: $ => choice(
      $.literal,
      $.identifier,
      $.method_identifier,
      $.instance_variable,
      $.class_variable,
      $.global_variable,
      $.constant,
      $.scoped_constant,
      $.generic_instance,
      $.parenthesized_expression,
      $.self,
      $.proc_literal,
      $.macro_expression_statement,
    ),

    // Scoped constant access: Foo::Bar, Foo::Bar::Baz, ::Foo (global scope), {{@type}}::MIN
    scoped_constant: $ => prec.left(PREC.SCOPE, choice(
      seq(
        choice($.constant, $.scoped_constant, $.macro_expression_statement),
        '::',
        $.constant,
      ),
      seq('::', $.constant),  // global scope prefix
    )),

    // Generic type used as expression: Array(Int32), Hash(String, Int32), Foo::Bar(Int32)
    generic_instance: $ => prec(PREC.CALL, seq(
      choice($.constant, $.scoped_constant),
      '(',
      commaSep1($.type),
      ')',
    )),

    parenthesized_expression: $ => seq('(', $.expression, ')'),
    self: $ => 'self',

    // =========================================================================
    // METHOD NAMES
    // =========================================================================
    // Method name: identifier or identifier with ? or ! suffix
    _method_name: $ => choice($.identifier, $.method_identifier),

    // Methods with ? or ! suffix: empty?, valid?, save!
    method_identifier: $ => METHOD_IDENTIFIER,

    // Setter method name: foo= (only valid in def)
    setter_method_name: $ => SETTER_IDENTIFIER,

    // =========================================================================
    // LITERALS
    // =========================================================================
    literal: $ => choice(
      $.nil_literal,
      $.bool_literal,
      $.integer_literal,
      $.float_literal,
      $.char_literal,
      $.string_literal,
      $.symbol_literal,
      $.array_literal,
      $.hash_literal,
      $.tuple_literal,
      $.regex_literal,
      $.command_literal,
      $.heredoc_literal,
      $.percent_literal,
    ),

    nil_literal: $ => 'nil',

    bool_literal: $ => choice('true', 'false'),

    integer_literal: $ => token(choice(
      // Decimal with optional type suffix (i8, i16, i32, i64, i128, u8, u16, u32, u64, u128)
      seq(optional('-'), /[0-9][0-9_]*/, optional(/[iu](8|16|32|64|128)/)),
      // Hex
      seq(optional('-'), /0x[0-9a-fA-F][0-9a-fA-F_]*/, optional(/[iu](8|16|32|64|128)/)),
      // Octal
      seq(optional('-'), /0o[0-7][0-7_]*/, optional(/[iu](8|16|32|64|128)/)),
      // Binary
      seq(optional('-'), /0b[01][01_]*/, optional(/[iu](8|16|32|64|128)/)),
    )),

    float_literal: $ => token(seq(
      optional('-'),
      /[0-9][0-9_]*/,
      choice(
        seq('.', /[0-9][0-9_]*/),
        seq('.', /[0-9][0-9_]*/, /[eE][+-]?[0-9]+/),
        /[eE][+-]?[0-9]+/,
      ),
      optional(choice('f32', 'f64')),
    )),

    char_literal: $ => seq(
      "'",
      choice(
        /[^'\\]/,  // single char
        $.char_escape_sequence,
      ),
      "'",
    ),

    char_escape_sequence: $ => token.immediate(choice(
      /\\[\\'"abefnrtv0]/,
      /\\u[0-9a-fA-F]{4}/,
      /\\u\{[0-9a-fA-F]+\}/,
    )),

    // String literal with interpolation support via external scanner
    string_literal: $ => seq(
      $._string_start,
      repeat(choice(
        $.string_content,
        $.string_interpolation,
        $.escape_sequence,
      )),
      $._string_end,
    ),

    string_interpolation: $ => seq(
      $.interpolation_start,
      $._statements,
      $.interpolation_end,
    ),

    escape_sequence: $ => token.immediate(choice(
      /\\[\\'"abefnrtv0]/,
      /\\x[0-9a-fA-F]{2}/,
      /\\u[0-9a-fA-F]{4}/,
      /\\u\{[0-9a-fA-F]+\}/,
      /\\[0-7]{1,3}/,
      /\\./,
    )),

    // Heredoc literal
    heredoc_literal: $ => seq(
      $._heredoc_start,
      repeat(choice(
        $.heredoc_content,
        $.string_interpolation,
        $.escape_sequence,
      )),
      $._heredoc_end,
    ),

    // Percent literals (%w, %i, %q, %Q, %r, %x, %())
    percent_literal: $ => seq(
      $._percent_literal_start,
      repeat(choice(
        $.percent_literal_content,
        $.string_interpolation,
        $.escape_sequence,
      )),
      $._percent_literal_end,
      optional($.regex_flags), // For %r() literals
    ),

    // Regex with external scanner for disambiguation
    regex_literal: $ => seq(
      $._regex_start,
      repeat(choice(
        $.regex_content,
        $.string_interpolation,
        $.escape_sequence,
      )),
      $._regex_end,
      optional($.regex_flags),
    ),

    regex_flags: $ => token.immediate(/[imx]+/),

    // Command literal with interpolation
    command_literal: $ => seq(
      $._command_start,
      repeat(choice(
        $.command_content,
        $.string_interpolation,
        $.escape_sequence,
      )),
      $._command_end,
    ),

    symbol_literal: $ => choice(
      seq(':', token.immediate(IDENTIFIER)),
      seq(':', token.immediate(METHOD_IDENTIFIER)),
      seq(':', token.immediate(SETTER_IDENTIFIER)),
      seq(':', token.immediate(CONSTANT)),
      seq(':"', /[^"]+/, '"'),
    ),

    // =========================================================================
    // COLLECTION LITERALS
    // =========================================================================
    array_literal: $ => seq(
      '[',
      commaSep($.expression),
      optional(','),
      ']',
      optional(seq('of', $.type)),
    ),

    hash_literal: $ => choice(
      seq(
        '{',
        commaSep1($.hash_entry),
        optional(','),
        '}',
        optional(seq('of', $.type, '=>', $.type)),
      ),
      // Empty hash with type: {} of String => Int32
      seq('{', '}', 'of', $.type, '=>', $.type),
    ),

    hash_entry: $ => seq(
      field('key', $.expression),
      '=>',
      field('value', $.expression),
    ),

    tuple_literal: $ => seq(
      '{',
      $.expression,
      ',',
      commaSep($.expression),
      optional(','),
      '}',
    ),

    named_tuple_literal: $ => seq(
      '{',
      commaSep1($.named_tuple_entry),
      optional(','),
      '}',
    ),

    named_tuple_entry: $ => seq(
      field('key', $.identifier),
      ':',
      field('value', $.expression),
    ),

    // =========================================================================
    // PROC LITERAL
    // =========================================================================
    proc_literal: $ => prec(1, seq(
      '->',
      optional($.proc_literal_params),
      $.block,
    )),

    proc_literal_params: $ => seq(
      '(',
      commaSep1(seq($.identifier, optional(seq(':', $.type)))),
      ')',
    ),

    // =========================================================================
    // VARIABLES & IDENTIFIERS
    // =========================================================================
    identifier: $ => IDENTIFIER,

    instance_variable: $ => seq('@', token.immediate(IDENTIFIER)),

    class_variable: $ => seq('@@', token.immediate(IDENTIFIER)),

    global_variable: $ => seq('$', token.immediate(choice(
      IDENTIFIER,
      /[0-9]+/,
      /[~?]/,
    ))),

    constant: $ => CONSTANT,

    // =========================================================================
    // COMMENT
    // =========================================================================
    comment: $ => token(prec(-1, seq('#', /.*/))),
  },
});

// =========================================================================
// HELPERS
// =========================================================================
/**
 * @param {RuleOrLiteral} rule
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/**
 * @param {RuleOrLiteral} rule
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
