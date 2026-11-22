# @javafy/server

Web-standard server primitives for Javafy API routes and request middleware.

## Install

```sh
npm install @javafy/server
```

## Public API

- `createApiRouter` — dispatch Web `Request` objects to method-based API handlers.
- `createMiddlewareHandler` — compose request middleware around a handler.
- Types: `ApiMethod`, `ApiRouteContext`, `ApiRouteHandler`, `ApiRouteDefinition`, `MiddlewareNext`, and `JavafyMiddleware`.

Handlers use the standard Web `Request` and `Response` APIs. Internal exception details are not returned in generic server errors.

## Requirements

Node.js 20 or newer and ESM support.

Full documentation: https://github.com/javaoff364-cloud/javafy
