# Advanced Crystal features

# Safe navigation operator
user&.name
user&.address&.city

# Method chaining
[1, 2, 3].map { |x| x * 2 }.select { |x| x > 2 }.first

# Ternary
x > 0 ? "pos" : "neg"

# Multi-assignment
a, b = 1, 2

# String escape sequences
"\n\t\\\""

# Char literal
'a'
'\n'

# Regex literal
/hello/i

# Type restrictions on variables
x : Int32 = 42

# Generic instantiation
arr = Array(Int32).new

# Proc literal
fn = ->(x : Int32) { x + 1 }

# Proc call
fn.call(5)

# Block with return type
[1, 2].map(&.to_s)

# of type annotation
[] of Int32
{} of String => Int32

# Uninitialized
x = uninitialized Int32

# Select expression
# select
# when ch.receive
#   puts "received"
# when timeout(1.second)
#   puts "timeout"
# end

# Macro usage
class Foo
  getter name : String
  property age : Int32

  def initialize(@name : String, @age : Int32)
  end
end

# Case with when using types
case obj
when Int32
  "int"
when String
  "string"
end

# Case with no value (acts as if/elsif chain)
case
when x > 0
  "positive"
when x < 0
  "negative"
else
  "zero"
end

# Until loop
until done
  process
end

# Modifier forms
x = 1 if condition
y = 2 unless flag
puts x while running

# Begin with multiple rescue
begin
  risky
rescue IO::Error
  handle_io
rescue ex : Exception
  handle_other
ensure
  cleanup
end

# Enum with methods
enum Color
  Red
  Green
  Blue

  def to_hex
    "hex"
  end
end

# Struct
struct Point
  property x : Float64
  property y : Float64
end

# Abstract class
abstract class Shape
  abstract def area : Float64
end

# Module with generic
module Comparable(T)
  abstract def <=>(other : T) : Int32
end

# Annotation
@[JSON::Serializable]
class Config
end

# Lib binding
lib LibC
  fun puts(str : UInt8*) : Int32
end

# Alias
alias Callback = Proc(Int32, String)

# Typeof
typeof(1)
typeof(1, "hello")

# is_a? and as
x.is_a?(Int32)
x.as(String)
x.as?(String)
x.responds_to?(:to_s)
x.nil?

# Splat in method call
foo(*args)
foo(**kwargs)

# Range
1..10
1...10

# Symbol
:hello
:"hello world"

# Tuple
{1, "hello"}

# Hash
{"key" => "value", "a" => "b"}

# Nil coalescing (not_nil!)
x.not_nil!
