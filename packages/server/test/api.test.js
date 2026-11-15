import test from "node:test";
import assert from "node:assert/strict";
import { createApiRouter } from "../dist/index.js";

const router = createApiRouter([
  { path: "/api/health", GET: () => Response.json({ ok: true }) },
  {
    path: "/api/users/:id",
    GET: (_request, { params }) => Response.json({ id: params.id }),
    PUT: async (request, { params }) => {
      const body = await request.json();
      return Response.json({ id: params.id, name: body.name });
    }
  }
]);

test("dispatches GET requests", async () => {
  const response = await router(new Request("http://localhost/api/health"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});
test("decodes dynamic route parameters", async () => {
  const response = await router(new Request("http://localhost/api/users/jane%20doe"));
  assert.deepEqual(await response.json(), { id: "jane doe" });
});
test("dispatches request bodies to method handlers", async () => {
  const response = await router(new Request("http://localhost/api/users/7", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Java" })
  }));
  assert.deepEqual(await response.json(), { id: "7", name: "Java" });
});
test("returns 405 with an Allow header", async () => {
  const response = await router(new Request("http://localhost/api/health", { method: "POST" }));
  assert.equal(response.status, 405);
  assert.match(response.headers.get("allow"), /GET/);
});
test("returns 404 for unknown API routes", async () => {
  const response = await router(new Request("http://localhost/api/missing"));
  assert.equal(response.status, 404);
});
test("automatically answers OPTIONS requests", async () => {
  const response = await router(new Request("http://localhost/api/health", { method: "OPTIONS" }));
  assert.equal(response.status, 204);
  assert.match(response.headers.get("allow"), /GET/);
});
test("uses GET as the HEAD fallback and removes the body", async () => {
  const response = await router(new Request("http://localhost/api/health", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});
