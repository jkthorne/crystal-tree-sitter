# A simple Crystal program
require "json"

class Person
  getter name : String
  getter age : Int32

  def initialize(@name : String, @age : Int32)
  end

  def greet
    puts "Hello, I'm #{name} and I'm #{age} years old"
  end
end

person = Person.new("Alice", 30)
person.greet

if person.age > 18
  puts "Adult"
else
  puts "Minor"
end

[1, 2, 3].each do |x|
  puts x
end
