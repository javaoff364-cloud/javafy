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

test("does not leak thrown exception details to API clients", async () => {
  const privateRouter = createApiRouter([{
    path: "/api/private",
    GET: () => { throw new Error("database password leaked"); }
  }]);
  const response = await privateRouter(new Request("http://localhost/api/private"));
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.message, "An unexpected error occurred.");
  assert.doesNotMatch(JSON.stringify(payload), /database password/);
});

test("explicit OPTIONS handlers include Allow header", async () => {
  const explicitRouter = createApiRouter([{
    path: "/api/options",
    GET: () => Response.json({ ok: true }),
    OPTIONS: () => new Response(null, { status: 200 })
  }]);
  const response = await explicitRouter(new Request("http://localhost/api/options", { method: "OPTIONS" }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("allow"), /GET/);
  assert.match(response.headers.get("allow"), /OPTIONS/);
});


test("runs middleware before API route handlers", async () => {
  const middleware = async (request, next) => {
    const response = await next(new Request(request, {
      headers: { "x-javafy-middleware": "active" }
    }));
    const headers = new Headers(response.headers);
    headers.set("x-middleware-ran", "true");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };
  const middlewareRouter = createApiRouter([{
    path: "/api/private",
    GET: (request) => Response.json({
      middleware: request.headers.get("x-javafy-middleware")
    })
  }], [middleware]);

  const response = await middlewareRouter(new Request("http://localhost/api/private"));
  assert.equal(response.headers.get("x-middleware-ran"), "true");
  assert.deepEqual(await response.json(), { middleware: "active" });
});


test("returns 400 for malformed JSON without exposing parser internals", async () => {
  const response = await router(new Request("http://localhost/api/users/7", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: "{invalid json"
  }));
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: "Bad Request",
    message: "The request body contains invalid JSON."
  });
});

test("returns 400 for a handler that explicitly rejects invalid request input", async () => {
  const validated = createApiRouter([{
    path: "/api/validated",
    POST: async (request) => {
      const body = await request.json();
      if (!body || typeof body.name !== "string" || body.name.trim() === "") {
        return Response.json({ error: "Validation Error", message: "name is required." }, { status: 400 });
      }
      return Response.json({ name: body.name.trim() });
    }
  }]);
  const response = await validated(new Request("http://localhost/api/validated", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: " " })
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Validation Error",
    message: "name is required."
  });
});
