# Changelog

## Unreleased — 0.7.0 development

- Extended the router context with `searchParams` and `hash`, so query-string and fragment changes are represented in router state.
- Added fullstack client transitions for same-origin links and `navigate()`, without reloading the document.
- Added an internal navigation-data endpoint that reruns request-time server loaders and returns fresh page props.
- Integrated browser Back/Forward with the same route-data refresh flow.
- Kept shared layouts mounted across route changes where their component identity is unchanged.
- Preserved ordinary browser behavior for external links, modified clicks, and download links.
- Added regression coverage for request-specific loader props and query-string data.

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
