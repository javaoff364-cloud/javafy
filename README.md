# Javafy

**Build faster. Run smarter.**

Javafy is a performance-first TypeScript fullstack framework for building React applications with file-based routing, API handlers, server rendering, and static generation.

> Javafy 0.8.0 is the current development version.

## Features

- TypeScript and TSX compilation powered by esbuild.
- React 19 application runtime.
- File-based pages, dynamic segments, required catch-all segments (`[...slug]`), optional catch-all segments (`[[...slug]]`), and nested layouts.
- File-based API routes with GET, POST, PUT, PATCH, DELETE, OPTIONS, and HEAD.
- File-based API middleware for API requests in development and production.
- File-based API middleware with ordered execution, short-circuit responses, and request replacement.
- Server-side rendering (SSR) for page requests.
- Server-side data loaders with `getServerSideProps`.
- Static site generation (SSG) with `getStaticProps` and `getStaticPaths`.
- Development server with React Fast Refresh, state-preserving HMR, browser error overlay, module graph inspection, and watched server route modules.
- Production Node.js server for SSR and API routes, with validated `HOST`/`PORT` overrides and clear startup errors.
- Validated route patterns and configuration, including duplicate route parameter and catch-all checks.
- Static assets and generated HTML in `dist/`.
- Fullstack client-side navigation with request-time loader refresh and browser Back/Forward support.
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

## API middleware

Create `src/app/middleware.ts` to run middleware before every file-based API route. Export one default middleware function:

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

Middleware runs in registration order before the API handler and unwinds in reverse order after it. Return a response without calling `next()` to stop the request. Call `next()` at most once; it may receive a replacement `Request` for downstream handlers. The initial middleware release applies to API routes in both development and production servers; page rendering and static asset requests do not pass through this pipeline.

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

The returned object is passed as page props. This loader runs for each server request and is not included in the browser bundle.

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

## Development runtime (0.6.0)

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

`useRouter()` exposes `pathname`, `params`, `searchParams`, `hash`, `navigate()`, `back()`, and `forward()`. In SPA mode, query-string and hash-only navigation update router state without a document reload. In fullstack mode, same-origin `Link` and `navigate()` transitions also stay on the current document: Javafy requests fresh server-loader props from its internal navigation-data endpoint, updates route content, and keeps compatible shared layout components mounted. Browser Back/Forward triggers the same data refresh. Modified clicks, downloads, and external links retain normal browser behavior. Navigation data responses are not cached.

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

- Fullstack client navigation currently uses a JSON data request per transition; streaming navigation, prefetching, cancellation UI, and route-level loading/error boundaries are not included.
- `getStaticPaths` currently accepts an array of `{ params }` objects; fallback modes are not implemented.
- Streaming SSR, route-level loading/error boundaries, and incremental regeneration are not included yet. React Fast Refresh is development-only.
- API routes use Web Request/Response handlers and do not currently provide a built-in database layer.

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
| 0.8.0 | API Middleware | File-based middleware discovery, composable request pipeline, API integration and regression coverage |
| 1.0.0 | Production | Optimizer, caching, security, benchmarks |

## Performance

Performance is a core design goal. We will publish reproducible benchmarks for cold start, build time, hot updates, memory use, and server response time before making speed comparisons with other frameworks.

## Contributing

Issues and pull requests are welcome. Include reproduction steps and environment details when reporting bugs.

## License

MIT
