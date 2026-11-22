# Javafy

**Build faster. Run smarter.**

Javafy is a performance-first TypeScript fullstack framework for building React applications with file-based routing, API handlers, server rendering, and static generation.

> Javafy 1.0.0 is merged into `main`. The four scoped workspace packages are prepared for npm publication.

## Features

- TypeScript and TSX compilation powered by esbuild.
- React 19 application runtime.
- File-based pages, dynamic segments, required catch-all segments (`[...slug]`), optional catch-all segments (`[[...slug]]`), nested layouts, route-level loading UI, and inherited route error boundaries.
- File-based API routes with GET, POST, PUT, PATCH, DELETE, OPTIONS, and HEAD.
- File-based request middleware for API, SSR, and client-navigation data requests, with ordered execution, short-circuit responses, and request replacement.
- Server-side rendering (SSR) for page requests.
- Server-side data loaders with `getServerSideProps`, opt-in `revalidate` caching, and explicit `getCacheKey` isolation.
- Static site generation (SSG) with `getStaticProps`, `getStaticPaths`, and explicit `fallback: false` / `fallback: "blocking"` modes.
- Development server with React Fast Refresh, state-preserving HMR, browser error overlay, module graph inspection, and watched server route modules.
- Production Node.js server for SSR and API routes, with validated `HOST`/`PORT` overrides, clear startup errors, and route-aware runtime diagnostics.
- Validated route patterns and configuration, including duplicate route parameter and catch-all checks.
- Static assets and generated HTML in `dist/`.
- Fullstack client-side navigation with request-time loader refresh, abortable superseded requests, browser Back/Forward support, and automatic same-origin route-data prefetching.
- Router URL state through `searchParams` and `hash`, with compatible shared layouts kept mounted across transitions.

## Requirements

- Node.js 20+
- npm 10+

## Quick start

```bash
git clone https://github.com/javaoff364-cloud/javafy.git
cd javafy
npm install
npm run build
npm run dev:example
```

Open http://localhost:3000.

## Pages and layouts

Create pages inside `src/app`:

```text
src/
└── app/
    ├── layout.tsx
    ├── page.tsx
    ├── not-found.tsx
    ├── about/
    │   └── page.tsx
    ├── blog/
    │   └── [id]/
    │       └── page.tsx
    ├── docs/
    │   └── [...slug]/
    │       └── page.tsx
    ├── optional-docs/
        └── [[...slug]]/
            └── page.tsx
    └── api/
        ├── health/
        │   └── route.ts
        └── users/
            └── [id]/
                └── route.ts
```

| File | URL |
| --- | --- |
| `src/app/page.tsx` | `/` |
| `src/app/about/page.tsx` | `/about` |
| `src/app/blog/[id]/page.tsx` | `/blog/:id` |
| `src/app/docs/[...slug]/page.tsx` | `/docs/*slug` (one or more segments) |
| `src/app/optional-docs/[[...slug]]/page.tsx` | `/optional-docs/*slug?` (zero or more segments) |
| `src/app/api/health/route.ts` | `/api/health` |
| `src/app/api/users/[id]/route.ts` | `/api/users/:id` |

A folder segment wrapped in square brackets becomes a dynamic parameter. The value is available as `params.id`. Use `[...slug]` for one or more remaining path segments and `[[...slug]]` when the remaining path is optional; catch-all values are exposed as slash-separated strings.

### Page components

Page components receive `params` and `pathname`:

```tsx
export default function BlogPage({
  params
}: {
  params: Record<string, string>;
}) {
  return <h1>Post: {params.id}</h1>;
}
```

### Layouts

A `layout.tsx` wraps pages in its folder and descendants. The root `src/app/layout.tsx` wraps every page.

### Route loading UI

Add a `loading.tsx` file beside a page to show a fallback while that route's client-navigation data is loading. A root `src/app/loading.tsx` is inherited by routes that do not define their own loading UI. The nearest route-level loading file takes precedence.

```tsx
export default function Loading() {
  return <p role="status">Loading page...</p>;
}
```

The loading component is rendered inside the route's shared layouts and is only shown during client-side data transitions; initial SSR/SSG rendering remains unchanged.

### Route error UI

Add an `error.tsx` file beside a page to provide a fallback for rendering or loader errors. A root `src/app/error.tsx` is inherited by routes without a closer error file; the nearest route-level file takes precedence.

```tsx
import type { JavafyErrorProps } from "@javafy/router";

export default function ErrorPage({ error, reset }: JavafyErrorProps) {
  return (
    <main role="alert">
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
```

The fallback receives the original `Error`, route `params`, `pathname`, and a `reset()` callback. Client-side render failures are caught without replacing the shared router; SSR and server-loader failures render the same route fallback with HTTP 500. If no `error.tsx` exists, Javafy displays its built-in generic error UI.

```tsx
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}
```

## API routes

Export named HTTP method handlers from a `route.ts` file. Handlers use the standard Web `Request` and `Response` APIs.

```ts
type Context = { params: Record<string, string> };

export async function GET(_request: Request, { params }: Context) {
  return Response.json({ id: params.id });
}

export async function PUT(request: Request, { params }: Context) {
  const body = await request.json() as { name: string };
  return Response.json({ id: params.id, name: body.name });
}
```

Javafy automatically matches dynamic API parameters, returns 404 for unknown endpoints, 405 with an `Allow` header for unsupported methods, supports `HEAD` via `GET` fallback, and responds to `OPTIONS`. Unhandled handler errors become JSON 500 responses.

## Request middleware

Create `src/app/middleware.ts` to run middleware before file-based API routes, server-rendered page requests, and client-navigation data requests. Export one default middleware function:

```ts
export default async function middleware(
  request: Request,
  next: (request?: Request) => Promise<Response>
) {
  const token = request.headers.get("authorization");
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await next();
  const headers = new Headers(response.headers);
  headers.set("x-powered-by", "Javafy");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
```

Middleware runs in registration order before the API handler and unwinds in reverse order after it. Return a response without calling `next()` to stop the request. Call `next()` at most once; it may receive a replacement `Request` for downstream handlers. Middleware runs for API routes, SSR page requests, and `/__javafy/data` navigation requests in both development and production servers. Static assets and build-time SSG rendering do not pass through this request pipeline.

## Server-side rendering and data

Javafy renders matched pages to HTML on the server. Export `getServerSideProps` to load request-specific data:

```tsx
export async function getServerSideProps({
  params,
  request,
  searchParams
}: {
  params: Record<string, string>;
  pathname: string;
  request: Request;
  searchParams: URLSearchParams;
}) {
  return {
    userAgent: request.headers.get("user-agent"),
    selectedTab: searchParams.get("tab"),
    profileId: params.id
  };
}

export default function ProfilePage({ userAgent }: { userAgent: string }) {
  return <p>Requested with: {userAgent}</p>;
}
```

The returned object is passed as page props. This loader runs on the server and is not included in the browser bundle. By default, request-time loader results are never cached.

### Server loader caching

Opt in to in-memory caching by exporting both `revalidate` (a positive number of seconds) and `getCacheKey` from the page module. The cache key must include every input that can change the result, including relevant user or authorization context:

```tsx
export const revalidate = 30;

export function getCacheKey({ params, searchParams, request }) {
  const userId = request?.headers.get("x-user-id") ?? "anonymous";
  return [userId, params.id, searchParams?.get("locale") ?? "en"].join(":");
}

export async function getServerSideProps({ params, request }) {
  return { id: params.id, userAgent: request?.headers.get("user-agent") };
}
```

Only successful `getServerSideProps` results are cached. Entries expire after `revalidate` seconds and the per-process cache is bounded to 500 entries. No cache is shared between server instances; static generation is unaffected. If either export is omitted or the key is empty, the loader runs for every request. Do not use a shared cache key for user-specific data.

## Static site generation

Static pages are rendered during `javafy build`. Pages without `getServerSideProps` are prerendered by default. Use `getStaticProps` for build-time data:

```tsx
export async function getStaticPaths() {
  return [
    { params: { id: "first-post" } },
    { params: { id: "second-post" } }
  ];
}

export async function getStaticProps({ params }: {
  params: Record<string, string>;
}) {
  return { title: "Post " + params.id };
}
```

Dynamic pages are prerendered for the parameter sets returned by `getStaticPaths`. Requests for unknown generated paths return 404 unless the page uses `getServerSideProps`.

Returned props are serialized into the HTML for hydration. Do not put secrets in page props.

## Development runtime

The development server transforms React components with the React Refresh Babel transform. When a module changes, Javafy rebuilds split ESM output and imports the updated application entry without reloading the document. React roots and unchanged vendor chunks are reused so compatible component state can survive edits.

Compilation errors appear in a browser overlay and are also reported in the terminal. The current esbuild module graph is available as JSON at `http://localhost:3000/__javafy/module-graph` while `javafy dev` is running. This endpoint is intended for diagnostics and tooling.

HMR applies to modules in the application source tree. Changes that alter component signatures incompatibly, global side effects, HTML shell files, or server-only route modules may require a full page refresh or server restart.

## Navigation

```tsx
import { Link, useRouter } from "@javafy/router";

export function Navigation() {
  const router = useRouter();
  return (
    <>
      <Link href="/about">About</Link>
      <button onClick={() => router.navigate("/?tab=home")}>Home</button>
      <p>Current tab: {router.searchParams.get("tab") ?? "default"}</p>
    </>
  );
}
```

`useRouter()` exposes `pathname`, `params`, `searchParams`, `hash`, `navigate()`, `back()`, `forward()`, and `prefetch()`. In SPA mode, query-string and hash-only navigation update router state without a document reload. In fullstack mode, same-origin `Link` and `navigate()` transitions also stay on the current document: Javafy requests fresh server-loader props from its internal navigation-data endpoint, updates route content, and keeps compatible shared layout components mounted. Browser Back/Forward triggers the same data refresh. Javafy prefetches same-origin route data when a `Link` is hovered or receives keyboard focus, then reuses that pending request during navigation. Failed prefetches are discarded so navigation can retry. Modified clicks, downloads, and external links retain normal browser behavior.

## Build and run

From the repository root:

```bash
npm run build
npm run typecheck:example
npm test
npm run build:example
npm run start:example
```

Or from a Javafy project directory:

```bash
node /path/to/javafy/packages/cli/dist/index.js dev
node /path/to/javafy/packages/cli/dist/index.js build
node /path/to/javafy/packages/cli/dist/index.js start
```

- `dev` starts the development server on the configured host and port (default 3000).
- `build` writes browser assets, prerendered pages, and a server manifest to `dist/`.
- `start` serves static output and handles API/SSR requests. Set `PORT` and `HOST` to override the server address.

Static hosts can serve prerendered pages and assets from `dist/`. Server-side rendering and API routes require a Node.js runtime running `javafy start`; a static host alone cannot execute them.

## Current limitations

- Fullstack client navigation uses JSON data requests; streaming navigation is not included.
- Streaming SSR is not included.
- React Fast Refresh is development-only; incompatible component signatures, global side effects, HTML shell changes, and server-only route changes may require a full refresh or restart.
- API routes use Web `Request`/`Response` handlers and do not include a built-in database or authentication layer.
- Dynamic SSG supports pre-generated paths and `fallback: false` or `fallback: "blocking"`; blocking fallback requires the Node.js production server.

## Roadmap

| Version | Milestone | Focus |
| --- | --- | --- |
| 0.1.0 | Foundation | Monorepo, core, CLI, minimal dev server |
| 0.2.0 | Development Engine | TypeScript/TSX compiler, rebuild, live reload |
| 0.3.0 | Routing | File-based routes, layouts, dynamic routes |
| 0.4.0 | Fullstack Engine | API routes, SSR, SSG, server data loaders |
| 0.5.0 | Runtime | React Fast Refresh, HMR, error overlay, module graph |
| 0.6.0 | Stability | Router/config validation, API hardening, production server validation, startup diagnostics and regression tests |
| 0.7.0 | Client Navigation | SPA/fullstack client transitions, server-loader refresh, router URL state, browser history integration and navigation regression coverage |
| 0.8.0 | Request Middleware & Navigation UX | Composable middleware across API/SSR/navigation requests, inherited route-level loading UI, same-origin link prefetching, and regression coverage |
| 0.9.0 | Reliability & Data UX | Route error boundaries, abortable navigation, explicit server-loader cache/revalidation, and runtime diagnostics |
| 1.0.0 | Production | Dynamic SSG fallback, cache isolation, API hardening, route-cache optimization, package verification, security analysis, benchmarks, and deployment guidance |

### 0.9.0 implementation details

Javafy 0.9.0 adds reliability-focused routing and data primitives:

- **Route error boundaries:** file-based `error.tsx` UI with nearest-ancestor fallback, retry support, and server-render fallback behavior.
- **Navigation cancellation:** superseded client transitions abort the previous route-data fetch; the abort signal reaches the server loader through `request.signal`.
- **Cache and revalidation:** opt-in `revalidate` seconds plus a required `getCacheKey` function; successful loader results are stored in a bounded per-process cache. No implicit caching is performed.
- **Runtime diagnostics:** route-aware loader and cache-key failures are logged with a `[Javafy diagnostics]` prefix.

The cache is per process, not distributed. Dynamic SSG supports pre-generated paths and blocking server fallback; streaming SSR, edge/serverless runtime compatibility, database integrations, and built-in authentication are not included.

## Performance

Performance is a core design goal. The 1.0.0 CI benchmark measures route matching, React SSR, and fullstack page rendering with warm-up, repeated samples, and Node/OS/CPU metadata. Reports are retained as workflow artifacts; comparisons should use equivalent environments.

## Javafy 1.0.0 documentation

- [Complete public API reference](docs/API.md)
- [Production deployment guide](docs/deployment.md)
- [1.0.0 production-readiness acceptance plan](docs/1.0.0-roadmap.md)

## Contributing

Issues and pull requests are welcome. Include reproduction steps and environment details when reporting bugs.

## License

MIT
