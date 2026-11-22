# @javafy/compiler

The compiler foundation for Javafy's custom source language.

This first implementation provides a location-aware lexer, a typed AST, and a parser for the initial static-page grammar. It is an early compiler foundation, not yet a production renderer or a complete language implementation.

## Supported syntax

```text
page Home {
  title: "Javafy"
  render {
    element main {
      h1 "Hello, Javafy!"
      text "My first Javafy application."
      button "About" {
        on click {
          navigate("/about")
        }
      }
    }
  }
}
```

## API

- `tokenize(source, fileName?)` returns tokens with source locations.
- `parse(source, fileName?)` returns a typed Javafy AST.
- `JavafySyntaxError` reports a file, line, and column.

Unsupported syntax is rejected instead of silently ignored. State, interpolation, component imports, services, API modules, semantic analysis, and code generation are future compiler stages.
