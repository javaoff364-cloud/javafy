import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createRouter, useRouter } from "../dist/index.js";

test("router exposes query parameters and hash from its initial URL", () => {
  function Page() {
    const router = useRouter();
    return createElement(
      "output",
      null,
      router.pathname + "|" + router.searchParams.get("q") + "|" + router.hash
    );
  }

  const Router = createRouter({
    initialPathname: "/search?q=javafy#results",
    routes: [{ path: "/search", component: Page }]
  });

  assert.equal(
    renderToString(createElement(Router)),
    "<output>/search|javafy|#results</output>"
  );
});

test("router exposes empty query and hash values when they are absent", () => {
  function Page() {
    const router = useRouter();
    return createElement(
      "output",
      null,
      router.searchParams.toString() + "|" + router.hash
    );
  }

  const Router = createRouter({
    initialPathname: "/",
    routes: [{ path: "/", component: Page }]
  });

  assert.equal(renderToString(createElement(Router)), "<output>|</output>");
});
