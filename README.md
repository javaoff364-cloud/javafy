# Javafy

**Build faster. Run smarter.**

Javafy is a performance-first TypeScript fullstack framework ecosystem for building modern web applications.

> Javafy is in early development. APIs and internal architecture may change before 1.0.

## Current status

**Stable foundation:** 0.3.0 — File-based Router  
**In development:** 0.4.0 — Fullstack Engine

Available now:
- TypeScript and TSX bundling through esbuild.
- React 19 application runtime.
- File-based routing from `src/app`.
- Static routes and dynamic segments such as `[id]`.
- Shared and nested `layout.tsx` files.
- Custom `not-found.tsx` page and default 404 fallback.
- Client-side navigation with `Link` and `useRouter`.
- Development server with automatic rebuild and browser live reload.
- Production JavaScript bundle and SPA fallback file (`dist/_redirects`).
- New `@javafy/server` API dispatcher foundation with typed Web Request/Response handlers.

The 0.4.0 API dispatcher is currently a runtime primitive. Automatic `src/app/api/**/route.ts` discovery, CLI server integration, SSR, and SSG are still being implemented.

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

Open http://localhost:3000. The example includes `/`, `/about`, and `/blog/first-post`.

## File-based routing

Create pages inside `src/app`:

```text
src/
└── app/
    ├── layout.tsx
    ├── page.tsx
    ├── not-found.tsx
    ├── about/
    │   └── page.tsx
    └── blog/
        └── [id]/
            └── page.tsx
```

| File | URL |
| --- | --- |
| `src/app/page.tsx` | `/` |
| `src/app/about/page.tsx` | `/about` |
| `src/app/blog/[id]/page.tsx` | `/blog/:id` |

A folder name wrapped in square brackets becomes a dynamic URL parameter. For example, `/blog/hello` provides `params.id === "hello"`.

### Page component

```tsx
export default function BlogPage({ params }: {
  params: Record<string, string>;
}) {
  return <h1>Post: {params.id}</h1>;
}
```

### Layout

A `layout.tsx` wraps pages in its folder and its descendants. The root `src/app/layout.tsx` wraps every matched route.

```tsx
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}
```

### Navigation

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

`useRouter()` exposes `pathname`, `params`, `navigate()`, `back()`, and `forward()`. `Link` performs same-origin client-side navigation while preserving normal browser behavior for modified clicks and external URLs.

## API router foundation (0.4.0)

The new `@javafy/server` package provides a Web-standard API dispatcher. It supports static and dynamic route patterns, typed request handlers, JSON responses, automatic `OPTIONS`, `HEAD` fallback, 404/405 responses, and handler error isolation.

```ts
import { createApiRouter } from "@javafy/server";

const api = createApiRouter([
  {
    path: "/api/health",
    GET: () => Response.json({ ok: true })
  },
  {
    path: "/api/users/:id",
    GET: (_request, { params }) => Response.json({ id: params.id })
  }
]);

const response = await api(new Request("http://localhost/api/users/42"));
```

This is the dispatcher API only; the CLI's automatic route-file loading is not yet part of this milestone.

## Production build

```bash
npm run build:example
```

The production output is written to `examples/hello-world/dist`. Javafy writes a `_redirects` SPA fallback file for static hosts that support the Netlify-style redirects format. Configure an equivalent fallback on other hosts.

## CLI commands

From a Javafy project directory:

```bash
node /path/to/javafy/packages/cli/dist/index.js dev
node /path/to/javafy/packages/cli/dist/index.js build
```

Projects without file-based routes can continue using the legacy `src/main.tsx` entry.

## Roadmap

| Version | Milestone | Focus |
| --- | --- | --- |
| 0.1.0 | Foundation | Monorepo, core, CLI, minimal dev server |
| 0.2.0 | Development Engine | TypeScript/TSX compiler, rebuild, live reload |
| 0.3.0 | Routing | File-based routes, layouts, dynamic routes, navigation |
| 0.4.0 | Fullstack | API routes, SSR, SSG, server-side data fetching |
| 0.5.0 | Runtime | React Fast Refresh, error overlay, module graph |
| 1.0.0 | Production | Optimizer, caching, security, benchmarks |

## Performance

Performance is a core design goal. We will publish reproducible benchmarks for cold start, build time, hot updates, memory use, and server response time before making speed comparisons with other frameworks.

## Contributing

Issues and pull requests are welcome. Include reproduction steps and environment details when reporting bugs.

## License

MIT
