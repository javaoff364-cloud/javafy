# Javafy

**Build faster. Run smarter.**

Javafy is a performance-first TypeScript fullstack framework for building React applications with file-based routing, API handlers, server rendering, and static generation.

> Javafy 0.5.0 is an early runtime release. APIs may evolve before 1.0.

## 0.5.0 features

- TypeScript and TSX compilation powered by esbuild.
- React 19 application runtime.
- File-based pages, dynamic segments, and nested layouts.
- File-based API routes with GET, POST, PUT, PATCH, DELETE, OPTIONS, and HEAD.
- Server-side rendering (SSR) for page requests.
- Server-side data loaders with `getServerSideProps`.
- Static site generation (SSG) with `getStaticProps` and `getStaticPaths`.
- Development server with React Fast Refresh, state-preserving HMR, browser error overlay, module graph inspection, and watched server route modules.
- Production Node.js server for SSR and API routes.
- Static assets and generated HTML in `dist/`.

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
| `src/app/api/health/route.ts` | `/api/health` |
| `src/app/api/users/[id]/route.ts` | `/api/users/:id` |

A folder segment wrapped in square brackets becomes a dynamic parameter. The value is available as `params.id`.

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

## Development runtime (0.5.0)

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
      <button onClick={() => router.navigate("/")}>Home</button>
    </>
  );
}
```

`useRouter()` exposes `pathname`, `params`, `navigate()`, `back()`, and `forward()`. In fullstack mode, same-origin navigation performs a document request so server-loaded props stay fresh. Modified clicks and external links retain normal browser behavior.

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

- Fullstack navigation uses document requests to refresh server data; state-preserving client transitions are planned for a later runtime milestone.
- `getStaticPaths` currently accepts an array of `{ params }` objects; fallback modes are not implemented.
- Streaming SSR, middleware, route-level loading/error boundaries, catch-all routes, and incremental regeneration are not included yet. React Fast Refresh is development-only.
- API routes use Web Request/Response handlers and do not currently provide a built-in database layer.

## Roadmap

| Version | Milestone | Focus |
| --- | --- | --- |
| 0.1.0 | Foundation | Monorepo, core, CLI, minimal dev server |
| 0.2.0 | Development Engine | TypeScript/TSX compiler, rebuild, live reload |
| 0.3.0 | Routing | File-based routes, layouts, dynamic routes |
| 0.4.0 | Fullstack Engine | API routes, SSR, SSG, server data loaders |
| 0.5.0 | Runtime | React Fast Refresh, state-preserving HMR, error overlay, module graph |
| 1.0.0 | Production | Optimizer, caching, security, benchmarks |

## Performance

Performance is a core design goal. We will publish reproducible benchmarks for cold start, build time, hot updates, memory use, and server response time before making speed comparisons with other frameworks.

## Contributing

Issues and pull requests are welcome. Include reproduction steps and environment details when reporting bugs.

## License

MIT
