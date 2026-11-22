import type { JavafyProgram, JavafyNode, SourceLocation } from "./language.js";
export type DiagnosticSeverity = "error" | "warning";
export interface JavafyDiagnostic { code: string; severity: DiagnosticSeverity; message: string; location: SourceLocation; }
const SAFE_PATH = /^\/(?!\/)[^\\\u0000-\u001f]*$/;
export function analyze(program: JavafyProgram): JavafyDiagnostic[] {
  const diagnostics: JavafyDiagnostic[] = [];
  const visit = (node: JavafyNode): void => {
    if (node.kind === "Element") {
      if (!/^[a-z][a-z0-9-]*$/.test(node.tag)) diagnostics.push({ code: "JFY1001", severity: "error", message: "HTML element names must be lowercase and may contain numbers or hyphens.", location: node.location });
      node.children.forEach(visit);
    } else if (node.kind === "Button") {
      if (!node.actions.length) diagnostics.push({ code: "JFY2001", severity: "warning", message: "This button has no click action.", location: node.location });
      for (const action of node.actions) if (!SAFE_PATH.test(action.target)) diagnostics.push({ code: "JFY2002", severity: "error", message: "navigate() requires a safe, same-origin absolute path beginning with one '/'.", location: action.location });
    }
  };
  program.page.children.forEach(visit);
  return diagnostics;
}
export function assertValid(program: JavafyProgram): void {
  const first = analyze(program).find((item) => item.severity === "error");
  if (first) throw new Error(first.location.fileName + ":" + first.location.line + ":" + first.location.column + ": [" + first.code + "] " + first.message);
}
