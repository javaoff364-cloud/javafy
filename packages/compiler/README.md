# @javafy/compiler

The compiler provides a location-aware lexer, typed AST, parser, and initial JavaScript code generator for the static-page grammar. It is an early compiler stage, not a full framework compiler.

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
- `generate(program, options?)` emits an ES module exporting a React page factory. The generated function accepts a React instance and returns React elements; page title is exported as `pageTitle`.

Generated output uses `React.createElement`, so it does not require JSX transpilation. Button navigation is emitted as a deferred click handler.

Unsupported syntax is rejected instead of silently ignored. State, interpolation, component imports, services, API modules, semantic analysis, source maps, and bundler integration remain future stages.
