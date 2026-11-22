# @javafy/core

Core configuration, route matching, and shared TypeScript types for Javafy 1.0.0.

## Install

```sh
npm install @javafy/core
```

## Public API

- `defineConfig(config)` — preserve the supplied configuration type.
- `resolveConfig(config?)` — apply defaults and validate Javafy configuration.
- `defaultConfig` — default application configuration.
- `JAVAFY_VERSION` — framework version.
- `matchRoute(pathname, routes)`, `isValidRoutePattern(pattern)`, and `validateRouteDefinitions(routes)` — route matching and validation helpers.
- `JavafyConfig`, `RouteDefinition`, and `RouteMatch` — shared types.

## Requirements

Node.js 20 or newer. This package is an ESM package and includes TypeScript declarations.

Full documentation: https://github.com/javaoff364-cloud/javafy
