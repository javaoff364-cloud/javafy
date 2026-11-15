# Changelog

## 0.4.0 — Fullstack Engine (in development)

- Added the new `@javafy/server` package.
- Added a typed Web Request/Response API dispatcher.
- Added static and dynamic API route matching.
- Added GET, POST, PUT, PATCH, DELETE, OPTIONS, and HEAD method handling.
- Added automatic OPTIONS responses, HEAD fallback, 404/405 responses, and handler error isolation.
- Added API dispatcher tests for methods, parameters, request bodies, and error cases.

Not yet included: automatic API route-file discovery, CLI HTTP server integration, SSR, SSG, and server-side page data loading.

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

Limitations: routing is client-side in this release. SSR, API routes, SSG, route-level loading/error boundaries, catch-all segments, and state-preserving HMR are not included.

## 0.2.0 — Development Engine

- Added esbuild-based TypeScript and TSX bundling.
- Added React and React DOM runtime dependencies.
- Added development server compilation for `src/main.tsx`.
- Added server-sent-event live reload after successful rebuilds.
- Added production bundling to `dist/assets/app.js`.
- Added a React TSX hello-world example.

Note: 0.2.0 live reload refreshes the page after rebuilds. State-preserving React Fast Refresh / true HMR is not included yet.
