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
    const manifestFile = join(root, "server-manifest.js");
    await buildFullstackManifest(root, app, manifestFile);
    const manifest = await loadFullstackManifest(manifestFile);

    const serverPage = await renderFullstackPage(manifest, "/posts/hello", {
      request: new Request("http://localhost/posts/hello?source=test")
    });
    assert.equal(serverPage.status, 200);
    assert.match(serverPage.html, /SSR: hello/);
    assert.match(serverPage.html, /Fixture layout/);

    assert.deepEqual(await getStaticRoutePaths(manifest), ["/posts/prebuilt"]);
    const staticPage = await renderFullstackPage(manifest, "/posts/prebuilt", { static: true });
    assert.equal(staticPage.status, 200);
    assert.match(staticPage.html, /SSG: prebuilt/);

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
