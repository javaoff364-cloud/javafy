# @javafy/router

React router primitives used by Javafy applications, including file-based route rendering, nested layouts, route loading/error boundaries, and client navigation.

## Install

```sh
npm install @javafy/router react
```

React 19 is a peer dependency.

## Public API

- `createRouter(options)` — create the Javafy router component.
- `Link` — same-origin client navigation with route-data prefetching.
- `useRouter()` — access route params, pathname, search params, hash, and navigation methods.
- `navigate(to, options?)` — navigate through browser history.
- Types: `JavafyPageProps`, `JavafyLayoutProps`, `JavafyErrorProps`, `JavafyRoute`, and `JavafyRouterValue`.

## Requirements

Node.js 20 or newer, React 19, and ESM support.

Full documentation: https://github.com/javaoff364-cloud/javafy
