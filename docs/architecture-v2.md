# Javafy Architecture V2

**Status:** Proposed architecture specification  
**Target:** Post-1.0.x major architecture track  
**Decision:** Hybrid routing + Javafy custom source syntax  
**Compatibility rule:** Existing JavaScript/TypeScript/TSX applications remain supported during the V2 transition.

## 1. Goals

Javafy V2 introduces a first-party source language and a deterministic hybrid router without requiring users to abandon the current React/TypeScript ecosystem.

The architecture must provide:

- A recognizable Javafy project structure and file extensions.
- File-based routes plus explicit route declarations.
- A compiler pipeline with useful diagnostics and source locations.
- Components, server services, and API handlers with clear runtime boundaries.
- Incremental adoption: existing TSX projects continue to build and run.
- Testable, documented behavior before a stable release.

V2 is not considered complete merely because the CLI can scaffold these files. Each syntax feature must parse, compile, execute, and have regression tests.

## 2. Project layout

Recommended default scaffold:

```text
my-javafy-app/
├── src/
│   ├── routes/
│   │   ├── index.jfy
│   │   ├── _layout.jfy
│   │   ├── _loading.jfy
│   │   ├── _error.jfy
│   │   ├── about.jfy
│   │   └── users/
│   │       ├── index.jfy
│   │       └── [id].jfy
│   ├── components/
│   │   └── Button.jfc
│   ├── services/
│   │   └── users.jfs
│   ├── api/
│   │   └── users/
│   │       ├── index.jfa
│   │       └── [id].jfa
│   ├── styles/
│   │   └── global.css
│   └── entry.jfy
├── static/
├── routes.jfy
├── javafy.config.ts
├── package.json
└── tsconfig.json
```

### File responsibilities

| File | Responsibility |
| --- | --- |
| `.jfy` | Page, layout, route-level UI, or route configuration |
| `.jfc` | Reusable Javafy UI component |
| `.jfs` | Server-only service/module |
| `.jfa` | API endpoint module |
| `.css` | Stylesheets |
| `.ts` / `.tsx` / `.js` / `.jsx` | Existing ecosystem and compatibility modules |

Special route files are reserved: `_layout.jfy`, `_loading.jfy`, `_error.jfy`, and `_not-found.jfy`. They are not URL segments.

## 3. Route discovery and hybrid routing

### 3.1 File-based routes

Files under `src/routes` are discovered automatically:

| Source file | URL |
| --- | --- |
| `routes/index.jfy` | `/` |
| `routes/about.jfy` | `/about` |
| `routes/users/index.jfy` | `/users` |
| `routes/users/[id].jfy` | `/users/:id` |
| `routes/docs/[...slug].jfy` | `/docs/*slug` |
| `routes/optional/[[...slug]].jfy` | `/optional/*slug?` |

Nested `_layout.jfy` files wrap routes in their directory and descendants. The nearest `_loading.jfy` and `_error.jfy` files apply to their route subtree, with closer files taking precedence.

### 3.2 Explicit routes

The root `routes.jfy` file declares routes that do not need to be represented by a file path, as well as redirects and aliases:

```text
routes {
  route "/dashboard" => Dashboard
  route "/account" => Account

  redirect "/home" -> "/"
  alias "/docs" -> "/guide"
}
```

The identifiers on the right resolve to imported route modules or exported route symbols. The compiler must report unresolved identifiers.

### 3.3 Conflict and precedence rules

- File routes and explicit routes are combined into one normalized route manifest.
- Duplicate paths are a compile-time error by default.
- An explicit route may replace a file route only with an explicit `override` declaration.
- Route matching uses specificity: static segments, then dynamic segments, then catch-all segments.
- Ambiguous patterns are rejected instead of relying on filesystem enumeration order.
- Parameter names must be unique within a route.
- Redirect loops and invalid targets are detected during build.
- The final manifest is deterministic and sorted; it must not depend on directory listing order.

Example explicit replacement:

```text
routes {
  override route "/about" => CustomAbout
}
```

## 4. Javafy source syntax

The language is intentionally block-based and readable. It is not JSX or TSX. Braces delimit blocks and expressions; strings use quotes; declarations have explicit keywords.

### 4.1 Page

`src/routes/index.jfy`:

```text
page Home {
  route: "/"
  title: "Javafy"

  render {
    element main {
      h1 "Hello, Javafy!"
      text "My first Javafy application."

      button "Get started" {
        on click {
          navigate("/about")
        }
      }
    }
  }
}
```

A page has a single default page declaration. The optional `route` field is validated against the discovered file route; it cannot silently remap the file.

### 4.2 Expressions and state

```text
page Counter {
  state count = 0

  render {
    element main {
      h1 "Counter"
      text "Count: {count}"

      button "Increase" {
        on click {
          count = count + 1
        }
      }
    }
  }
}
```

Expressions use `{...}` interpolation. State updates are reactive and event handlers run only in the client component runtime. The compiler rejects writes to undeclared or immutable bindings.

### 4.3 Component

`src/components/Button.jfc`:

```text
component Button {
  props {
    label: string
    disabled: boolean = false
  }

  render {
    element button {
      attribute disabled = props.disabled
      text "{props.label}"
    }
  }
}
```

Components are imported by module path and referenced by their exported component name. Props are type-checked where type information is available.

### 4.4 Server service

`src/services/users.jfs`:

```text
service Users {
  async function find(id: string) {
    return database.users.find(id)
  }
}
```

A `.jfs` module is server-only. It must never enter a browser bundle. Importing it from a client-only component or client entry is a compile-time boundary error.

### 4.5 API endpoint

`src/api/users/[id].jfa`:

```text
endpoint UsersById {
  path: "/api/users/:id"

  GET(request, context) {
    return json {
      id: context.params.id
    }
  }
}
```

The file path determines the default endpoint path. If an explicit `path` is present, it must match the discovered path or be rejected. Supported methods initially: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD. Request and response behavior should use standard Web Request/Response semantics at the runtime boundary.

## 5. Compiler architecture

The compiler is a first-class package, proposed as `@javafy/compiler`.

Pipeline:

1. **File resolver** — resolves extensions, imports, aliases, and project boundaries.
2. **Lexer** — converts source characters into tokens with offsets and line/column locations.
3. **Parser** — validates grammar and builds an AST.
4. **Semantic analyzer** — validates declarations, names, props, route conflicts, and client/server boundaries.
5. **Type integration** — checks built-in types and interoperates with TypeScript declarations.
6. **Transformer** — converts AST nodes into JavaScript modules and source maps.
7. **Bundler integration** — passes generated modules into the existing esbuild-based build pipeline.

Compiler diagnostics must include file, line, column, a concise message, and (where possible) a suggested correction. Invalid syntax must fail the build; it must never silently become an empty component.

## 6. Runtime and package boundaries

Proposed package responsibilities:

- `@javafy/compiler`: lexer, parser, AST, semantic analysis, transforms, diagnostics.
- `@javafy/core`: shared config, route manifest types, resolution utilities.
- `@javafy/router`: browser navigation and route rendering.
- `@javafy/server`: server request pipeline, middleware, API dispatch, SSR.
- `@javafy/cli`: project creation, dev server, compiler orchestration, production build.

The compiler must not duplicate routing behavior. It emits a normalized route manifest consumed by the existing core/router/server layers.

## 7. Compatibility and migration

- Existing `src/app/**/*.tsx` projects continue to work in the 1.x compatibility mode.
- V2 projects use `src/routes` and Javafy source files.
- A project must not mix both route roots by accident. If both are present, configuration must explicitly select the mode or the CLI reports an actionable error.
- Existing TypeScript/TSX components can be imported from Javafy modules through an explicit interoperability boundary.
- Javafy modules may import TypeScript types, but server-only modules remain protected from client bundles.
- No existing public API is removed as part of the initial compiler introduction.

## 8. Configuration

The existing `javafy.config.ts` remains the project configuration entry point. Proposed options:

```ts
import { defineConfig } from "@javafy/core";

export default defineConfig({
  source: {
    mode: "javafy",
    routes: "src/routes",
    api: "src/api",
    components: "src/components"
  }
});
```

The exact exported API must be checked against the current config implementation before implementation. Defaults should make a fresh scaffold work without extra configuration.

## 9. Implementation milestones

### A. Specification and compatibility tests
- Freeze the file naming rules and grammar.
- Add fixture projects for valid and invalid source examples.
- Define route conflict, precedence, and server/client boundary tests.

### B. Compiler foundation
- Add `@javafy/compiler`.
- Implement lexer, parser, AST, source spans, diagnostics.
- Add parser snapshots and malformed-input tests.

### C. First executable vertical slice
- Compile a static `.jfy` page.
- Render it through the existing React runtime.
- Resolve one `.jfc` component import.
- Verify browser and server bundles separately.

### D. Hybrid routing
- Discover file routes.
- Parse explicit `routes.jfy`.
- Merge, validate, sort, and serialize a route manifest.
- Add dynamic and catch-all route tests.

### E. Server and API modules
- Compile `.jfs` into server-only modules.
- Compile `.jfa` into existing API handler contracts.
- Add boundary and request-method tests.

### F. Developer experience and production
- Integrate compiler watch mode and HMR.
- Add useful CLI diagnostics.
- Build production bundles and source maps.
- Add scaffold, package smoke, and end-to-end tests.
- Update documentation and migration guide.

## 10. Release acceptance criteria

V2 is not ready for a stable release until all of the following are true:

- A fresh scaffold builds and runs using only documented commands.
- All documented syntax examples parse and execute.
- Invalid syntax produces precise diagnostics and non-zero exit status.
- File-based and explicit routes combine deterministically.
- Duplicate and ambiguous routes are rejected.
- Nested layouts and route-level loading/error behavior work.
- `.jfs` code is absent from browser bundles.
- `.jfa` handlers support documented HTTP methods and dynamic parameters.
- Existing 1.x TSX fixture projects still pass compatibility tests.
- CI runs build, typecheck, unit, integration, package-smoke, and production verification suites.
- README, API reference, syntax reference, and migration guide match actual behavior.

## 11. Open design constraints

These are intentionally not guessed in implementation and must be resolved by tests and focused design decisions:

- Whether custom syntax supports generic types or delegates type declarations to TypeScript.
- Exact component lifecycle and state semantics.
- Async rendering and streaming semantics.
- Whether route declarations may be nested or imported from separate route config modules.
- How CSS scoping and style imports work.
- How Javafy modules interoperate with third-party React components.

Until resolved, these features must not be advertised as implemented.
