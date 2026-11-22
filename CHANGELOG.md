# Changelog

## 1.0.1 — CLI Project Scaffolding

- Added `javafy create <project-name>` to generate a ready-to-run React 19 + TypeScript application.
- Updated generated application dependencies to the matching 1.0.1 Javafy packages.
- Added regression coverage for project creation, overwrite protection, and package-version alignment.
- Updated package smoke checks and release metadata for the 1.0.1 release.

- Added `javafy create <project-name>` to scaffold a ready-to-run Javafy application without cloning the framework repository.
- Added CLI tests for project creation, missing names, and refusing to overwrite non-empty directories.
- Updated the npm quick start and CLI documentation to use the published packages.


## 1.0.0 — Production Readiness

- Added dynamic SSG blocking fallback through `getStaticPaths` returning `{ paths, fallback: "blocking" }`; the default remains `false`.
- Scoped request-time loader cache entries by route parameters, application cache key, and a SHA-256 digest of authorization/cookie identity to reduce cross-user cache collisions.
- Classified malformed JSON raised by API handlers as a generic 400 client error while keeping internal exceptions private behind generic 500 responses.
- Cached ranked route tables between route matches and invalidated the cached ranking when route definitions change.
- Added SSR determinism, blocking SSG fallback, loader-cache identity isolation, malformed JSON, and route-ranking cache regression tests.
- Added package tarball content checks, a Node.js 20/22/24 CI matrix, production smoke tests, performance artifacts, npm audit, and CodeQL analysis.
- Added a complete public API reference and Node.js production deployment guide.

These notes describe the 1.0.0 code merged into `main`. npm publication is performed separately for the four public `@javafy/*` workspace packages.

## 0.9.0 — Reliability & Data UX

- Hardened file-based `error.tsx` boundaries with nearest-ancestor fallback and retry support across client rendering and server-rendered failure states.
- Added abortable client navigation: a newer transition cancels the previous route-data request, and request abort signals reach server loaders through `request.signal`.
- Added opt-in server-loader caching through `revalidate` and `getCacheKey`; only successful request-time loader results are cached.
- Bounded the in-memory loader cache to 500 entries and documented cache-key safety requirements for user-specific data.
- Added route-aware runtime diagnostics for loader and cache-key failures.
- Added regression coverage for explicit cache reuse and default no-cache behavior.


## 0.8.0 — Request Middleware & Navigation UX

- Added file-based route loading UI with `loading.tsx` for client-side navigation transitions.
- Added inherited loading UI with nearest-ancestor precedence and route-specific overrides; loading UI renders inside shared layouts.
- Added a composable request middleware pipeline to the server package.
- Added file-based middleware discovery through `src/app/middleware.ts`.
- Applied middleware to API routes, SSR page requests, and client-navigation data requests in development and production servers.
- Added ordered execution, response short-circuiting, downstream request replacement, and duplicate-`next()` protection.
- Added server and CLI regression tests for middleware composition and manifest loading.
- Added automatic same-origin route-data prefetching for Javafy links on pointer hover and keyboard focus.
- Reused pending prefetched requests during navigation; failed prefetches are discarded so navigation can retry.

Current scope: middleware wraps API, SSR page, and navigation-data requests. Static assets and build-time SSG rendering are not wrapped.

## 0.7.0 — Client Navigation

- Extended the router context with `searchParams` and `hash`, so query-string and fragment changes are represented in router state.
- Added fullstack client transitions for same-origin links and `navigate()`, without reloading the document.
- Added an internal navigation-data endpoint that reruns request-time server loaders and returns fresh page props.
- Integrated browser Back/Forward with the same route-data refresh flow.
- Kept shared layouts mounted across route changes where their component identity is unchanged.
- Preserved ordinary browser behavior for external links, modified clicks, and download links.
- Added regression coverage for request-specific loader props and query-string data.
- Preserved query-string state during SSR hydration.

This release uses JSON navigation-data requests for fullstack transitions. Streaming SSR, prefetching, cancellation UI, and route-level loading/error boundaries remain future work.

## 0.6.0 — Stability and Production Hardening

- Added validation for route patterns, including invalid parameters, duplicate parameter names, and catch-all placement.
- Added configuration validation for application name, host, port, and directory settings.
- Hardened API `OPTIONS` responses with an automatically computed `Allow` header unless the handler explicitly provides one.
- Sanitized API 500 responses so internal exception details are logged on the server and not exposed to clients.
- Validated production `HOST` and `PORT` environment overrides, including port range and hostname checks.
- Added clear startup diagnostics for ports already in use, permission errors, and other server bind failures.
- Added regression coverage for encoded paths, malformed catch-all encodings, static-route precedence, extra path segments, and server port binding.
- Aligned the root workspace and all Javafy packages to version 0.6.0.

Known limitations: Fast Refresh is development-only; incompatible component signatures, global side effects, HTML shell changes, and server-only route changes may require a full refresh or restart. Browser-level state-preservation behavior should be verified in a real application before treating it as fully supported.


## 0.5.0 — Runtime Engine

- Added React Refresh transforms for application TS/TSX modules.
- Added split ESM development output and HMR updates without reloading the document.
- Preserved React roots between updates and reused unchanged vendor chunks.
- Added a browser compilation-error overlay and module graph diagnostics endpoint.
- Added integration coverage for the runtime assets, refresh preamble, and HMR events.
- Fixed non-router development bootstrapping so `src/main.tsx` is actually loaded from the dev server.
- Added required and optional catch-all routes for pages and API handlers, including static path generation.
- Improved route specificity and safe decoding for encoded path segments.
- Prevented API handler exception details from leaking to clients.
- Corrected HEAD handling for static files and SSR responses.
- Kept the React Refresh runtime out of production bundles.

Known limitations: incompatible component signature changes, HTML shell edits, global side effects, and server-only route changes may require a full page refresh or server restart. Fast Refresh is development-only.

## 0.4.0 — Fullstack Engine

- Added the `@javafy/server` package and Web-standard API route dispatcher.
- Added automatic discovery of `src/app/api/**/route.ts` files.
- Added GET, POST, PUT, PATCH, DELETE, OPTIONS, and HEAD API handlers with dynamic parameters.
- Added development and production API request handling.
- Added server-side rendering for file-based pages.
- Added `getServerSideProps` for request-time data loading.
- Added static site generation for static routes and dynamic paths returned by `getStaticPaths`.
- Added `getStaticProps` for build-time page data.
- Added a production `start` command to serve static files, API routes, and SSR pages.
- Added server route file watching in development.
- Added SSR hydration data transfer and full document navigation to keep server props current.
- Added API route and SSR/SSG examples, route discovery tests, and production smoke tests.

Known limitations: `getStaticPaths` currently accepts an array of `{ params }`; fallback modes, streaming SSR, middleware, incremental regeneration, and state-preserving client navigation are not included.

## 0.3.0 — File-based Router

- Added the `@javafy/router` package.
- Added route discovery from `src/app/**/page.tsx` and `page.ts`.
- Added static and dynamic routes using bracket segments such as `[id]`.
- Added root and nested `layout.tsx` support.
- Added custom `not-found.tsx` and a built-in 404 fallback.
- Added `Link`, `useRouter`, and client-side `navigate()` APIs.
- Integrated file routes into the development server and production build.
- Added development SPA fallback and production `dist/_redirects`.
- Updated the hello-world example and documentation.

Limitations: routing was client-side in this release. SSR, API routes, SSG, route-level loading/error boundaries, catch-all segments, and state-preserving HMR were not included.

## 0.2.0 — Development Engine

- Added esbuild-based TypeScript and TSX bundling.
- Added React and React DOM runtime dependencies.
- Added development server compilation for `src/main.tsx`.
- Added server-sent-event live reload after successful rebuilds.
- Added production bundling to `dist/assets/app.js`.
- Added a React TSX hello-world example.

Note: 0.2.0 live reload refreshes the page after rebuilds. State-preserving React Fast Refresh / true HMR is not included yet.
