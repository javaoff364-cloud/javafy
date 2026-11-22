import test from "node:test";
import assert from "node:assert/strict";
import { JavafySyntaxError, parse, tokenize } from "../dist/index.js";

const source = [
  "page Home {",
  '  title: "Javafy"',
  "  render {",
  "    element main {",
  '      h1 "Hello, Javafy!"',
  '      text "Welcome"',
  '      button "About" {',
  "        on click {",
  '          navigate("/about")',
  "        }",
  "      }",
  "    }",
  "  }",
  "}"
].join("\n");

test("tokenizes identifiers, strings, symbols and source locations", () => {
  const tokens = tokenize('page Home { title: "Hello" }', "home.jfy");
  assert.equal(tokens[0].value, "page");
  assert.equal(tokens[0].location.fileName, "home.jfy");
  assert.equal(tokens.find((token) => token.kind === "string")?.value, "Hello");
  assert.equal(tokens.at(-1)?.kind, "eof");
});
test("skips line comments", () => {
  const tokens = tokenize('// comment\npage Home {}');
  assert.equal(tokens[0].value, "page");
  assert.equal(tokens[0].location.line, 2);
});
test("decodes supported string escapes", () => {
  assert.equal(tokenize('"line\\nnext"')[0].value, "line\nnext");
});
test("parses nested elements, text, title and navigation actions", () => {
  const ast = parse(source, "src/routes/index.jfy");
  assert.equal(ast.kind, "Program");
  assert.equal(ast.page.name, "Home");
  assert.equal(ast.page.title, "Javafy");
  assert.equal(ast.page.children[0].kind, "Element");
  assert.equal(ast.page.children[0].tag, "main");
  assert.equal(ast.page.children[0].children[0].kind, "Text");
  const button = ast.page.children[0].children[2];
  assert.equal(button.kind, "Button");
  assert.deepEqual(button.actions.map((action) => action.target), ["/about"]);
});
test("allows a page without a title", () => {
  assert.equal(parse("page Home { render {} }").page.title, undefined);
});
test("rejects a page without a render block", () => {
  assert.throws(() => parse('page Home { title: "Missing" }'), /must contain a render block/);
});
test("rejects duplicate title and render declarations", () => {
  assert.throws(() => parse('page Home { title: "A" title: "B" render {} }'), /one title/);
  assert.throws(() => parse("page Home { render {} render {} }"), /one render block/);
});
test("rejects unknown render nodes", () => {
  assert.throws(() => parse('page Home { render { mystery "x" } }'), /Unknown render node/);
});
test("reports file, line and column for syntax errors", () => {
  assert.throws(() => parse("page Home {\n  render {\n    text 42\n  }\n}", "broken.jfy"),
    (error) => error instanceof JavafySyntaxError && error.fileName === "broken.jfy" && error.line === 3 && error.column === 10);
});
test("rejects unterminated strings and unexpected characters", () => {
  assert.throws(() => tokenize('"unfinished'), /Unterminated string/);
  assert.throws(() => tokenize("@"), /Unexpected character/);
});
test("rejects trailing declarations after the page", () => {
  assert.throws(() => parse("page Home { render {} } page Other { render {} }"), /Unexpected content/);
});
