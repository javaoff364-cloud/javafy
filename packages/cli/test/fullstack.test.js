import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverFullstackFiles, getStaticRoutePaths } from "../dist/fullstack.js";

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
