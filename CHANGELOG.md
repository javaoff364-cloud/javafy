# Changelog

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
