# Javafy 1.0.2 API Reference

This reference describes the public API implemented by the 1.0.0 candidate. Javafy targets Node.js 20+ and ESM. React 19 is the UI runtime.

## CLI

| Command | Purpose |
| --- | --- |
| `javafy dev` | Start the development server with TypeScript/TSX compilation and React Fast Refresh |
| `javafy build` | Compile browser assets, server manifest, and generated static pages into `dist/` |
| `javafy start` | Start the Node.js production server for SSR and API routes |
| `javafy --help` | Print command help |
| `javafy --version` | Print the CLI version |

The default command is `dev`. Unknown commands exit with a non-zero status.

## Configuration

Use `javafy.config.js` and export a default object.

| Property | Type | Default |
| --- | --- | --- |
| `name` | string | `Javafy App` |
| `dev.host` | string | `localhost` |
| `dev.port` | integer 1–65535 | `3000` |
| `publicDir` | string | `public` |
| `appDir` | string | `src/app` |

`defineConfig(config)` preserves the supplied type; `resolveConfig(config)` applies defaults and validates values.

## Core routing

`matchRoute(pathname, routes)` matches static, named dynamic (`:id`), required catch-all (`*slug`), and optional catch-all (`*slug?`) segments. Static segments have higher precedence. `validateRouteDefinitions(routes)` rejects invalid patterns and ambiguous duplicate patterns. `isValidRoutePattern(pattern)` checks route syntax.

## React router

- `createRouter(options)` creates the router component.
- `useRouter()` returns `params`, `pathname`, `searchParams`, `hash`, `navigate`, `back`, `forward`, and `prefetch`.
- `Link` is an anchor with same-origin client navigation and prefetch behavior.
- `JavafyPageProps`, `JavafyLayoutProps`, `JavafyErrorProps`, `JavafyRoute`, and `JavafyRouterValue` are exported types.

## Page data APIs

- `getServerSideProps(context)` runs for server requests.
- `getStaticProps(context)` runs during SSG; it can also serve an ungenerated route when `getStaticPaths` opts into `fallback: "blocking"`.
- `getStaticPaths()` returns an array of `{ params }` entries, or `{ paths, fallback }`. The default fallback is `false`; `"blocking"` renders a missing path on the server before returning HTML.
- `revalidate` is a positive number of seconds and is used only with `getServerSideProps` plus `getCacheKey`.
- `getCacheKey(context)` returns an application-defined cache partition. Javafy additionally scopes cache entries by route params and a one-way hash of request authorization/cookie headers.

Loader context contains `params`, `pathname`, and, for request-time execution, `request` and `searchParams`. Do not put secrets in returned page props; props are serialized into the HTML document for browser hydration.

The loader cache is process-local, bounded, and best-effort. It is not a distributed cache and does not coordinate across Node processes or deployments. User-specific cache correctness still depends on returning an appropriate key and not relying on an omitted identity header.

## API handlers

Export named `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, or `HEAD` functions from `route.ts`. Each handler receives a Web `Request` and `{ params, pathname }`, and must return a Web `Response`.

Javafy provides automatic OPTIONS responses, GET-to-HEAD fallback, 404 and 405 responses, and generic 500 JSON responses. Exception messages and stack traces are not sent to clients.

## Middleware

A default export from `src/app/middleware.ts` receives `(request, next)`. It can return a response to short-circuit or call `next(replacementRequest?)` once. Middleware runs in registration order before the handler and unwinds in reverse order. A second call to `next()` is rejected.

## Server exports

`javafy/server` exports `createApiRouter`, `createMiddlewareHandler`, and the `ApiMethod`, `ApiRouteContext`, `ApiRouteHandler`, `ApiRouteDefinition`, `MiddlewareNext`, and `JavafyMiddleware` types.

`javafy` exports `defineConfig`, `resolveConfig`, `defaultConfig`, `JAVAFY_VERSION`, route matching/validation helpers, and route types.

`javafy/router` exports `createRouter`, `navigate`, `Link`, `useRouter`, and router prop/value types.
