import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFullstackManifest, discoverFullstackFiles, getStaticRoutePaths, loadFullstackManifest, renderFullstackPage } from "../dist/fullstack.js";

test("discovers page, nested layout, and API route files", () => {
  const root = mkdtempSync(join(tmpdir(), "javafy-fullstack-"));
  const app = join(root, "src", "app");
  mkdirSync(join(app, "dashboard"), { recursive: true });
  mkdirSync(join(app, "api", "users", "[id]"), { recursive: true });
  writeFileSync(join(app, "layout.tsx"), "export default function Layout({children}) { return children }");
  writeFileSync(join(app, "dashboard", "layout.tsx"), "export default function DashboardLayout({children}) { return children }");
  writeFileSync(join(app, "dashboard", "page.tsx"), "export default function Dashboard() { return null }");
  writeFileSync(join(app, "api", "users", "[id]", "route.ts"), "export function GET() { return Response.json({ ok: true }) }");

  try {
    const found = discoverFullstackFiles(app);
    assert.equal(found.pages.length, 1);
    assert.equal(found.pages[0].path, "/dashboard");
    assert.equal(found.pages[0].layouts.length, 2);
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
