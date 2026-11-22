import test from "node:test";
import assert from "node:assert/strict";
import { parse, generate } from "../dist/index.js";

test("generates page factory, title and nested React elements", () => {
  const ast = parse('page Home { title: "Hello" render { element main { h1 "Welcome" p "Body" } } }');
  const output = generate(ast);
  assert.match(output, /export const pageTitle = "Hello"/);
  assert.match(output, /export default function createPage\(React\)/);
  assert.match(output, /React\.createElement\("main", null/);
  assert.match(output, /React\.createElement\("h1", null, "Welcome"\)/);
  assert.match(output, /React\.createElement\("p", null, "Body"\)/);
});

test("generates click navigation as a deferred handler", () => {
  const ast = parse('page Home { render { button "Go" { on click { navigate("/next") } } } }');
  assert.match(generate(ast), /onClick: \(\) => \{ globalThis\.location\?\.assign\("\/next"\); \}/);
});

test("uses JSON escaping for generated string literals", () => {
  const ast = parse('page Home { title: "A\\nB" render { text "quote: \\" and slash \\\\" } }');
  const output = generate(ast);
  assert.match(output, /pageTitle = "A\\nB"/);
  assert.ok(output.includes(JSON.stringify('quote: " and slash \\')));
});

test("wraps multiple top-level nodes in a React fragment", () => {
  assert.match(generate(parse('page Home { render { h1 "A" text "B" } }')), /React\.createElement\(React\.Fragment, null/);
});

test("rejects invalid function names", () => {
  assert.throws(() => generate(parse("page Home { render {} }"), { functionName: "bad-name" }), /valid JavaScript identifier/);
});
