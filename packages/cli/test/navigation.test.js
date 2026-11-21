import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFullstackManifest, loadFullstackManifest, renderFullstackPage } from "../dist/fullstack.js";

test("navigation data loads request-specific page props and query parameters", async () => {
  const root = mkdtempSync(join(process.cwd(), ".javafy-navigation-"));
  const app = join(root, "src", "app");
  mkdirSync(join(app, "search"), { recursive: true });
  writeFileSync(join(app, "search", "page.tsx"), `
    export default function SearchPage({ term }) { return <p>{term}</p>; }
    export async function getServerSideProps({ searchParams }) {
      return { term: searchParams.get("q") ?? "" };
    }
  `);
  try {
    const manifestFile = join(root, "server-manifest.mjs");
    await buildFullstackManifest(root, app, manifestFile);
    const manifest = await loadFullstackManifest(manifestFile);
    const rendered = await renderFullstackPage(manifest, "/search", {
      request: new Request("http://localhost/search?q=javafy")
    });
    assert.equal(rendered.status, 200);
    assert.deepEqual(rendered.props, { term: "javafy" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
