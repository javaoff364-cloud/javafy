import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFullstackManifest, discoverFullstackFiles, getStaticRoutePaths, loadFullstackManifest, renderFullstackPage } from "../dist/fullstack.js";

test("discovers page, nested layout, and API route files", () => {
  const root = mkdtempSync(join(tmpdir(), "javafy-fullstack-"));
  const app = join(root, "src", "app");
  mkdirSync(join(app, "dashboard", "settings"), { recursive: true });
  mkdirSync(join(app, "reports"), { recursive: true });
  mkdirSync(join(app, "api", "users", "[id]"), { recursive: true });
  writeFileSync(join(app, "loading.tsx"), "export default function RootLoading() { return null }");
  writeFileSync(join(app, "error.tsx"), "export default function RootError() { return null }");
  writeFileSync(join(app, "dashboard", "loading.tsx"), "export default function DashboardLoading() { return null }");
  writeFileSync(join(app, "dashboard", "error.tsx"), "export default function DashboardError() { return null }");
  writeFileSync(join(app, "layout.tsx"), "export default function Layout({children}) { return children }");
  writeFileSync(join(app, "dashboard", "layout.tsx"), "export default function DashboardLayout({children}) { return children }");
  writeFileSync(join(app, "dashboard", "page.tsx"), "export default function Dashboard() { return null }");
  writeFileSync(join(app, "dashboard", "settings", "page.tsx"), "export default function Settings() { return null }");
  writeFileSync(join(app, "reports", "page.tsx"), "export default function Reports() { return null }");
  writeFileSync(join(app, "api", "users", "[id]", "route.ts"), "export function GET() { return Response.json({ ok: true }) }");

  try {
    const found = discoverFullstackFiles(app);
    assert.equal(found.pages.length, 3);
    assert.equal(found.pages[0].path, "/dashboard");
    assert.equal(found.pages[0].layouts.length, 2);
    assert.equal(found.pages.find((page) => page.path === "/dashboard").loading, join(app, "dashboard", "loading.tsx"));
    assert.equal(found.pages.find((page) => page.path === "/dashboard/settings").loading, join(app, "dashboard", "loading.tsx"));
    assert.equal(found.pages.find((page) => page.path === "/reports").loading, join(app, "loading.tsx"));
    assert.equal(found.pages.find((page) => page.path === "/dashboard").error, join(app, "dashboard", "error.tsx"));
    assert.equal(found.pages.find((page) => page.path === "/dashboard/settings").error, join(app, "dashboard", "error.tsx"));
    assert.equal(found.pages.find((page) => page.path === "/reports").error, join(app, "error.tsx"));
    assert.equal(found.api.length, 1);
    assert.equal(found.api[0].path, "/api/users/:id");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("builds static paths and skips server-rendered pages", async () => {
  const paths = await getStaticRoutePaths({
    pages: [
      { path: "/", component: () => null, layouts: [] },
      { path: "/about", component: () => null, layouts: [], getServerSideProps: async () => ({}) },
      {
        path: "/posts/:id",
        component: () => null,
        layouts: [],
        getStaticPaths: async () => [{ params: { id: "one" } }, { params: { id: "two" } }]
      }
    ],
    apiRoutes: []
  });
  assert.deepEqual(paths, ["/", "/posts/one", "/posts/two"]);
});

test("builds a server manifest and renders SSR, SSG, API, and custom 404", async () => {
  const root = mkdtempSync(join(process.cwd(), ".javafy-fullstack-integration-"));
  const app = join(root, "src", "app");
  mkdirSync(join(app, "posts", "[slug]"), { recursive: true });
  mkdirSync(join(app, "static", "[slug]"), { recursive: true });
  mkdirSync(join(app, "api", "posts", "[id]"), { recursive: true });
  writeFileSync(join(app, "layout.tsx"), `
    export default function Layout({ children }) {
      return <div><header>Fixture layout</header>{children}</div>;
    }
  `);
  writeFileSync(join(app, "posts", "[slug]", "loading.tsx"), `
    export default function Loading() { return <p>Loading post</p>; }
  `);
  writeFileSync(join(app, "posts", "[slug]", "error.tsx"), `
    export default function PostError({ error, reset }) {
      return <section role="alert"><h1>Post failed</h1><p>{error.message}</p><button onClick={reset}>Retry</button></section>;
    }
  `);
  writeFileSync(join(app, "posts", "[slug]", "page.tsx"), `
    export default function PostPage({ params, title }) {
      return <article><h1>{title}</h1><p>{params.slug}</p></article>;
    }
    export async function getServerSideProps({ params }) {
      return { title: "SSR: " + params.slug };
    }
  `);
  writeFileSync(join(app, "static", "[slug]", "page.tsx"), `
    export default function StaticPage({ params, title }) {
      return <article><h1>{title}</h1><p>{params.slug}</p></article>;
    }
    export async function getStaticPaths() {
      return [{ params: { slug: "prebuilt" } }];
    }
    export async function getStaticProps({ params }) {
      return { title: "SSG: " + params.slug };
    }
  `);
  writeFileSync(join(app, "api", "posts", "[id]", "route.ts"), `
    export function GET(_request, { params }) {
      return Response.json({ id: params.id });
    }
  `);
  writeFileSync(join(app, "not-found.tsx"), `
    export default function NotFound() {
      return <h1>Custom fixture 404</h1>;
    }
  `);

  try {
    const manifestFile = join(root, "server-manifest.mjs");
    await buildFullstackManifest(root, app, manifestFile);
    const manifest = await loadFullstackManifest(manifestFile);

    const serverPage = await renderFullstackPage(manifest, "/posts/hello", {
      request: new Request("http://localhost/posts/hello?source=test")
    });
    assert.equal(serverPage.status, 200);
    assert.match(serverPage.html, /SSR: hello/);
    assert.match(serverPage.html, /Fixture layout/);
    assert.equal(typeof manifest.pages.find((page) => page.path === "/posts/:slug").loading, "function");
    assert.equal(typeof manifest.pages.find((page) => page.path === "/posts/:slug").error, "function");

    const brokenManifest = {
      ...manifest,
      pages: manifest.pages.map((entry) => entry.path === "/posts/:slug"
        ? { ...entry, component: () => { throw new Error("fixture render failure"); } }
        : entry)
    };
    const failedPage = await renderFullstackPage(brokenManifest, "/posts/broken");
    assert.equal(failedPage.status, 500);
    assert.match(failedPage.html, /Post failed/);
    assert.match(failedPage.html, /fixture render failure/);

    assert.deepEqual(await getStaticRoutePaths(manifest), ["/static/prebuilt"]);
    const staticPage = await renderFullstackPage(manifest, "/static/prebuilt", { static: true });
    assert.equal(staticPage.status, 200);
    assert.match(staticPage.html, /SSG: prebuilt/);
    const ungenerated = await renderFullstackPage(manifest, "/static/not-generated");
    assert.equal(ungenerated.status, 404);

    const missing = await renderFullstackPage(manifest, "/missing");
    assert.equal(missing.status, 404);
    assert.match(missing.html, /Custom fixture 404/);

    const { createApiRouter } = await import("@javafy/server");
    const api = createApiRouter(manifest.apiRoutes);
    const apiResponse = await api(new Request("http://localhost/api/posts/42"));
    assert.equal(apiResponse.status, 200);
    assert.deepEqual(await apiResponse.json(), { id: "42" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovers required and optional catch-all page and API routes", () => {
  const root = mkdtempSync(join(tmpdir(), "javafy-catchall-"));
  const app = join(root, "src", "app");
  mkdirSync(join(app, "docs", "[...slug]"), { recursive: true });
  mkdirSync(join(app, "optional", "[[...parts]]"), { recursive: true });
  mkdirSync(join(app, "api", "files", "[...path]"), { recursive: true });
  writeFileSync(join(app, "docs", "[...slug]", "page.tsx"), "export default function Docs() { return null }");
  writeFileSync(join(app, "optional", "[[...parts]]", "page.tsx"), "export default function Optional() { return null }");
  writeFileSync(join(app, "api", "files", "[...path]", "route.ts"), "export function GET() { return Response.json({ ok: true }) }");
  try {
    const found = discoverFullstackFiles(app);
    assert.ok(found.pages.some((page) => page.path === "/docs/*slug"));
    assert.ok(found.pages.some((page) => page.path === "/optional/*parts?"));
    assert.ok(found.api.some((route) => route.path === "/api/files/*path"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generates static paths for catch-all route parameters", async () => {
  const paths = await getStaticRoutePaths({
    pages: [{
      path: "/docs/*slug",
      component: () => null,
      layouts: [],
      getStaticPaths: async () => [
        { params: { slug: "guide/start here" } },
        { params: { slug: "api/reference" } }
      ]
    }, {
      path: "/optional/*parts?",
      component: () => null,
      layouts: [],
      getStaticPaths: async () => [{ params: {} }, { params: { parts: "one/two" } }]
    }],
    apiRoutes: []
  });
  assert.deepEqual(paths, ["/docs/guide/start%20here", "/docs/api/reference", "/optional", "/optional/one/two"]);
});

test("optional catch-all SSG paths do not match paths that were not generated", async () => {
  const manifest = {
    pages: [{
      path: "/optional/*parts?",
      component: () => null,
      layouts: [],
      getStaticPaths: async () => [{ params: {} }]
    }],
    apiRoutes: []
  };
  const missing = await renderFullstackPage(manifest, "/optional/not-generated");
  assert.equal(missing.status, 404);
});


test("discovers and loads app middleware for API requests", async () => {
  const root = mkdtempSync(join(process.cwd(), ".javafy-middleware-integration-"));
  const app = join(root, "src", "app");
  mkdirSync(join(app, "api", "private"), { recursive: true });
  writeFileSync(join(app, "middleware.ts"), `
    export default async function middleware(request, next) {
      const headers = new Headers(request.headers);
      headers.set("x-javafy-auth", "checked");
      return next(new Request(request, { headers }));
    }
  `);
  writeFileSync(join(app, "api", "private", "route.ts"), `
    export function GET(request) {
      return Response.json({ auth: request.headers.get("x-javafy-auth") });
    }
  `);

  try {
    const discovered = discoverFullstackFiles(app);
    assert.ok(discovered.middleware);
    const manifestFile = join(root, "server-manifest.mjs");
    await buildFullstackManifest(root, app, manifestFile);
    const manifest = await loadFullstackManifest(manifestFile);
    assert.equal(typeof manifest.middleware, "function");

    const { createApiRouter } = await import("@javafy/server");
    const api = createApiRouter(manifest.apiRoutes, [manifest.middleware]);
    const response = await api(new Request("http://localhost/api/private"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { auth: "checked" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("server loader cache is opt-in, keyed, and reused within its revalidation window", async () => {
  let calls = 0;
  const manifest = {
    pages: [{
      path: "/cached/:id", component: () => null, layouts: [], revalidate: 30,
      getCacheKey: ({ params }) => params.id,
      getServerSideProps: async ({ params }) => ({ id: params.id, call: ++calls })
    }],
    apiRoutes: []
  };
  const first = await renderFullstackPage(manifest, "/cached/one", {
    request: new Request("http://localhost/cached/one")
  });
  const second = await renderFullstackPage(manifest, "/cached/one", {
    request: new Request("http://localhost/cached/one")
  });
  assert.deepEqual(first.props, { id: "one", call: 1 });
  assert.deepEqual(second.props, { id: "one", call: 1 });
  assert.equal(calls, 1);
});

test("server loader results are not cached without an explicit cache key and revalidate value", async () => {
  let calls = 0;
  const manifest = {
    pages: [{
      path: "/uncached", component: () => null, layouts: [],
      getServerSideProps: async () => ({ call: ++calls })
    }],
    apiRoutes: []
  };
  await renderFullstackPage(manifest, "/uncached", { request: new Request("http://localhost/uncached") });
  await renderFullstackPage(manifest, "/uncached", { request: new Request("http://localhost/uncached") });
  assert.equal(calls, 2);
});
