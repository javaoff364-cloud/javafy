# @javafy/compiler

The compiler provides a location-aware lexer, typed AST, parser, semantic analyzer, and initial JavaScript code generator for the static-page grammar. It is an early compiler stage, not a full framework compiler.

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
- `analyze(program)` returns structured errors and warnings.
- `assertValid(program)` throws when semantic errors exist.
- `generate(program, options?)` emits an ES module exporting a React page factory.
- `JavafySyntaxError` reports a file, line, and column.

Generated output uses `React.createElement`, so it does not require JSX transpilation. Button navigation is emitted as a deferred click handler.

The semantic pass validates HTML element names and same-origin navigation targets, and warns about buttons without actions. Unsupported syntax is rejected instead of silently ignored.

State, interpolation, component imports, services, API modules, source maps, route discovery, and bundler integration remain future stages.
