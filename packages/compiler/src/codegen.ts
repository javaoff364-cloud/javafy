import type { JavafyNode, JavafyProgram } from "./language.js";

export interface CodegenOptions {
  functionName?: string;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function renderNode(node: JavafyNode): string {
  switch (node.kind) {
    case "Element": {
      const children = node.children.map(renderNode);
      return "React.createElement(" + quote(node.tag) + ", null" +
        (children.length ? ", " + children.join(", ") : "") + ")";
    }
    case "Text":
      return "React.createElement(" + quote(node.tag) + ", null, " + quote(node.value) + ")";
    case "Button": {
      const action = node.actions.map((item) => {
        if (item.kind === "Navigate") return "globalThis.location?.assign(" + quote(item.target) + ");";
        return "";
      }).join("");
      const props = action ? "{ onClick: () => { " + action + " } }" : "null";
      return "React.createElement(\"button\", " + props + ", " + quote(node.label) + ")";
    }
  }
}

export function generate(program: JavafyProgram, options: CodegenOptions = {}): string {
  const functionName = options.functionName ?? "createPage";
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(functionName)) {
    throw new Error("Javafy codegen: functionName must be a valid JavaScript identifier.");
  }
  const rendered = program.page.children.map(renderNode).join(", ");
  const body = program.page.children.length === 1
    ? rendered
    : "React.createElement(React.Fragment, null" + (rendered ? ", " + rendered : "") + ")";
  const title = program.page.title === undefined ? "" : "export const pageTitle = " + quote(program.page.title) + ";\n";
  return title + "export default function " + functionName + "(React) {\n  return " + body + ";\n}\n";
}
