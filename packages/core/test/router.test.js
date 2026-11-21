import test from "node:test";
import assert from "node:assert/strict";
import { matchRoute } from "../dist/router.js";

test("matches a static route", () => {
  const routes = [{ path: "/" }, { path: "/about" }];
  assert.equal(matchRoute("/about", routes)?.route.path, "/about");
});

test("extracts decoded dynamic route parameters", () => {
  const routes = [{ path: "/blog/:id" }];
  assert.deepEqual(matchRoute("/blog/hello%20world", routes)?.params, {
    id: "hello world"
  });
});

test("prefers static routes over dynamic routes", () => {
  const routes = [{ path: "/blog/:id" }, { path: "/blog/new" }];
  assert.equal(matchRoute("/blog/new", routes)?.route.path, "/blog/new");
});

test("normalizes trailing slashes and ignores query strings", () => {
  const routes = [{ path: "/about" }];
  assert.equal(matchRoute("/about/?mode=dark", routes)?.route.path, "/about");
});

test("returns null when no route matches", () => {
  assert.equal(matchRoute("/missing", [{ path: "/" }]), null);
});

test("uses segment-by-segment specificity for ambiguous dynamic routes", () => {
  const routes = [{ path: "/:category/new" }, { path: "/blog/:slug" }];
  assert.equal(matchRoute("/blog/new", routes)?.route.path, "/blog/:slug");
});

test("matches required catch-all routes and joins decoded segments", () => {
  const routes = [{ path: "/docs/*slug" }];
  assert.deepEqual(matchRoute("/docs/getting-started/hello%20world", routes)?.params, {
    slug: "getting-started/hello world"
  });
});

test("matches optional catch-all routes with zero or more segments", () => {
  const routes = [{ path: "/docs/*slug?" }];
  assert.deepEqual(matchRoute("/docs", routes)?.params, { slug: "" });
  assert.deepEqual(matchRoute("/docs/api/reference", routes)?.params, { slug: "api/reference" });
});

test("decodes encoded static path segments", () => {
  const routes = [{ path: "/café" }];
  assert.equal(matchRoute("/caf%C3%A9", routes)?.route.path, "/café");
});

test("rejects malformed percent encoding", () => {
  assert.equal(matchRoute("/blog/%E0%A4%A", [{ path: "/blog/:id" }]), null);
});

test("does not allow a catch-all segment before another route segment", () => {
  assert.equal(matchRoute("/docs/a/end", [{ path: "/docs/*slug/end" }]), null);
});


test("rejects invalid route patterns and duplicate parameter names", async () => {
  const { isValidRoutePattern } = await import("../dist/router.js");
  assert.equal(isValidRoutePattern("/users/:id"), true);
  assert.equal(isValidRoutePattern("/docs/*path?"), true);
  assert.equal(isValidRoutePattern("/users/:id/:id"), false);
  assert.equal(isValidRoutePattern("/docs/*path/end"), false);
  assert.equal(isValidRoutePattern("/users/:bad-name"), false);
  assert.equal(isValidRoutePattern("/docs/*"), false);
});

test("skips invalid route patterns instead of matching them", async () => {
  const { isValidRoutePattern } = await import("../dist/router.js");
  assert.equal(isValidRoutePattern("/users/:id/:id"), false);
  assert.equal(matchRoute("/users/a/b", [{ path: "/users/:id/:id" }, { path: "/users/:first/:second" }])?.route.path, "/users/:first/:second");
});


test("ignores query and fragment when matching pathname", () => {
  const routes = [{ path: "/blog/:id" }];
  assert.equal(matchRoute("/blog/post-1?preview=true#comments", routes)?.params.id, "post-1");
});

test("matches a static route when encoded characters are present", () => {
  const routes = [{ path: "/café" }, { path: "/:slug" }];
  assert.equal(matchRoute("/caf%C3%A9", routes)?.route.path, "/café");
});

test("rejects malformed percent encoding in catch-all parameters", () => {
  const routes = [{ path: "/docs/*slug" }];
  assert.equal(matchRoute("/docs/%E0%A4%A", routes), null);
});

test("prefers a longer static route over a shorter dynamic route", () => {
  const routes = [{ path: "/:section" }, { path: "/docs/api" }];
  assert.equal(matchRoute("/docs/api", routes)?.route.path, "/docs/api");
});

test("does not match extra path segments on non-catch-all routes", () => {
  const routes = [{ path: "/blog/:id" }];
  assert.equal(matchRoute("/blog/post-1/comments", routes), null);
});
