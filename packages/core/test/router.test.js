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
