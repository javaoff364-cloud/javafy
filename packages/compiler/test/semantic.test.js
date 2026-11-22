import test from "node:test";
import assert from "node:assert/strict";
import { analyze, assertValid, parse } from "../dist/index.js";
test("accepts valid same-origin navigation", () => { const p = parse('page Home { render { button "Go" { on click { navigate("/about") } } } }'); assert.deepEqual(analyze(p), []); assert.doesNotThrow(() => assertValid(p)); });
test("warns about buttons without actions", () => { const d = analyze(parse('page Home { render { button "Save" } }')); assert.equal(d[0].code, "JFY2001"); assert.equal(d[0].severity, "warning"); });
test("rejects external, protocol-relative and javascript navigation", () => { for (const target of ["https://example.com", "//evil.example", "javascript:alert(1)"]) { const p = parse('page Home { render { button "Go" { on click { navigate(' + JSON.stringify(target) + ') } } } }', "unsafe.jfy"); assert.equal(analyze(p)[0].code, "JFY2002"); assert.throws(() => assertValid(p), /JFY2002/); } });
test("rejects malformed element names", () => { const d = analyze(parse('page Home { render { element Main {} } }')); assert.equal(d[0].code, "JFY1001"); assert.equal(d[0].severity, "error"); });
