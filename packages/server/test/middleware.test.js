import test from "node:test";
import assert from "node:assert/strict";
import { createMiddlewareHandler } from "../dist/index.js";

test("runs middleware in registration order and unwinds in reverse order", async () => {
  const events = [];
  const handler = createMiddlewareHandler([
    async (_request, next) => {
      events.push("first:before");
      const response = await next();
      events.push("first:after");
      return response;
    },
    async (_request, next) => {
      events.push("second:before");
      const response = await next();
      events.push("second:after");
      return response;
    }
  ], () => {
    events.push("handler");
    return Response.json({ ok: true });
  });

  const response = await handler(new Request("http://localhost/"));
  assert.equal(response.status, 200);
  assert.deepEqual(events, [
    "first:before",
    "second:before",
    "handler",
    "second:after",
    "first:after"
  ]);
});

test("allows middleware to short-circuit the request", async () => {
  let handlerCalled = false;
  const handler = createMiddlewareHandler([
    () => new Response("Unauthorized", { status: 401 })
  ], () => {
    handlerCalled = true;
    return new Response("ok");
  });

  const response = await handler(new Request("http://localhost/private"));
  assert.equal(response.status, 401);
  assert.equal(await response.text(), "Unauthorized");
  assert.equal(handlerCalled, false);
});

test("passes a replacement Request to downstream middleware and handler", async () => {
  const handler = createMiddlewareHandler([
    (request, next) => next(new Request(request, {
      headers: { "x-javafy-user": "verified" }
    }))
  ], (request) => Response.json({
    user: request.headers.get("x-javafy-user")
  }));

  const response = await handler(new Request("http://localhost/private"));
  assert.deepEqual(await response.json(), { user: "verified" });
});

test("rejects middleware that calls next more than once", async () => {
  const handler = createMiddlewareHandler([
    async (_request, next) => {
      await next();
      return next();
    }
  ], () => new Response("ok"));

  await assert.rejects(
    handler(new Request("http://localhost/")),
    /next\(\) may only be called once/
  );
});

test("rejects middleware that does not return a Response", async () => {
  const handler = createMiddlewareHandler([
    () => undefined
  ], () => new Response("ok"));

  await assert.rejects(
    handler(new Request("http://localhost/")),
    /middleware must return a Web Response/
  );
});
