import { readFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import type { Plugin } from "esbuild";
export const JAVAFY_SOURCE_EXTENSIONS = [".jfx", ".jf", ".jfy", ".jfc", ".jfs", ".jfa"] as const;
export function isJavafySourceFile(path: string): boolean {
  return (JAVAFY_SOURCE_EXTENSIONS as readonly string[]).includes(extname(path).toLowerCase());
}
export function createJavafySourcePlugin(): Plugin {
  return { name: "javafy-native-source", setup(build) {
    build.onLoad({ filter: /\.(?:jfx|jf|jfy|jfc|jfs|jfa)$/i }, (args) => ({
      contents: readFileSync(args.path, "utf8"),
      loader: [".jfx", ".jfy", ".jfc"].includes(extname(args.path).toLowerCase()) ? "tsx" : "ts",
      resolveDir: dirname(args.path)
    }));
  }};
}
export const JAVAFY_RESOLVE_EXTENSIONS = [".tsx", ".ts", ".jfx", ".jf", ".jfc", ".jfy", ".jfs", ".jfa", ".jsx", ".js", ".json"];
