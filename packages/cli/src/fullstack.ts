import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { createRouter, type JavafyLayoutProps, type JavafyPageProps } from "@javafy/router";
import { matchRoute, type RouteDefinition } from "@javafy/core";
import type { ApiRouteDefinition } from "@javafy/server";
import { build } from "esbuild";

type DataContext = {
  params: Record<string, string>;
  pathname: string;
  request?: Request;
  searchParams?: URLSearchParams;
};

type DataResult = Record<string, unknown> | void | null;
type DataLoader = (context: DataContext) => DataResult | Promise<DataResult>;

type PageModule = {
  default: ComponentType<JavafyPageProps>;
  getServerSideProps?: DataLoader;
  getStaticProps?: DataLoader;
  getStaticPaths?: () => Array<{ params: Record<string, string> }> | Promise<Array<{ params: Record<string, string> }>>;
};

type LayoutModule = { default: ComponentType<JavafyLayoutProps> };

export interface FullstackPage extends RouteDefinition {
  component: ComponentType<JavafyPageProps>;
  layouts: ComponentType<JavafyLayoutProps>[];
  getServerSideProps?: DataLoader;
  getStaticProps?: DataLoader;
  getStaticPaths?: PageModule["getStaticPaths"];
}

export interface FullstackManifest {
  pages: FullstackPage[];
  apiRoutes: ApiRouteDefinition[];
  notFound?: ComponentType<JavafyPageProps>;
}

export interface DiscoveredFiles {
  pages: Array<{ path: string; page: string; layouts: string[] }>;
  api: Array<{ path: string; file: string }>;
  notFound?: string;
  watchDirs: string[];
}

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const;

function routeSegment(segment: string): string {
  if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment)) return "*" + segment.slice(5, -2) + "?";
  if (/^\[\.\.\.[^\]]+\]$/.test(segment)) return "*" + segment.slice(4, -1);
  return /^\[[^\]]+\]$/.test(segment) ? ":" + segment.slice(1, -1) : segment;
}

function isDynamicRoute(path: string): boolean {
  return /(^|\/)(?::[^/]+|\*[^/?]+\??)(?=\/|$)/.test(path);
}

export function discoverFullstackFiles(appDir: string): DiscoveredFiles {
  const pages: DiscoveredFiles["pages"] = [];
  const api: DiscoveredFiles["api"] = [];
  const watchDirs: string[] = [];
  const findFile = (directory: string, names: string[]) =>
    names.map((name) => resolve(directory, name)).find(existsSync);

  function walk(directory: string, segments: string[]): void {
    if (!existsSync(directory) || !statSync(directory).isDirectory()) return;
    watchDirs.push(directory);
    const entries = readdirSync(directory, { withFileTypes: true });
    const pageFile = findFile(directory, ["page.tsx", "page.ts"]);
    const apiFile = findFile(directory, ["route.ts", "route.tsx"]);
    const rootLayout = findFile(appDir, ["layout.tsx", "layout.ts"]);
    if (pageFile) {
      const layouts: string[] = [];
      if (rootLayout) layouts.push(rootLayout);
      let parent = appDir;
      for (const segment of segments) {
        parent = resolve(parent, segment);
        const layout = findFile(parent, ["layout.tsx", "layout.ts"]);
        if (layout && !layouts.includes(layout)) layouts.push(layout);
      }
      pages.push({
        path: segments.length ? "/" + segments.map(routeSegment).join("/") : "/",
        page: pageFile,
        layouts
      });
    }
    if (apiFile && segments[0] === "api") {
      api.push({
        path: "/" + [...segments].map(routeSegment).join("/"),
        file: apiFile
      });
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith(".")) {
        walk(resolve(directory, entry.name), [...segments, entry.name]);
      }
    }
  }

  const notFound = ["not-found.tsx", "not-found.ts"].map((name) => resolve(appDir, name)).find(existsSync);
  walk(appDir, []);
  return { pages, api, ...(notFound ? { notFound } : {}), watchDirs };
}


export async function buildFullstackManifest(
  root: string,
  appDir: string,
  outputFile: string
): Promise<void> {
  const discovered = discoverFullstackFiles(appDir);
  const imports = new Map<string, string>();
  const importFor = (file: string): string => {
    const found = imports.get(file);
    if (found) return found;
    const name = "Module" + imports.size;
    imports.set(file, name);
    return name;
  };

  for (const page of discovered.pages) {
    importFor(page.page);
    page.layouts.forEach(importFor);
  }
  for (const route of discovered.api) importFor(route.file);
  if (discovered.notFound) importFor(discovered.notFound);

  const source = [
    ...[...imports.entries()].map(([file, name]) => `import * as ${name} from ${JSON.stringify(file)};`),
    "export const pages = [",
    ...discovered.pages.map((page) => {
      const mod = importFor(page.page);
      const layouts = page.layouts.map((file) => `${importFor(file)}.default`);
      return `  { path: ${JSON.stringify(page.path)}, component: ${mod}.default, layouts: [${layouts.join(", ")}], getServerSideProps: ${mod}.getServerSideProps, getStaticProps: ${mod}.getStaticProps, getStaticPaths: ${mod}.getStaticPaths },`;
    }),
    "];",
    "export const apiRoutes = [",
    ...discovered.api.map((route) => {
      const mod = importFor(route.file);
      return `  { path: ${JSON.stringify(route.path)}, ${methods.map((method) => `${method}: ${mod}.${method}`).join(", ")} },`;
    }),
    "];",
    `export const notFound = ${discovered.notFound ? importFor(discovered.notFound) + ".default" : "undefined"};`
  ].join("\n");

  mkdirSync(dirname(outputFile), { recursive: true });
  await build({
    absWorkingDir: root,
    stdin: { contents: source, resolveDir: root, sourcefile: "javafy-server-manifest.ts" },
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    packages: "external",
    jsx: "automatic",
    sourcemap: false,
    logLevel: "silent"
  });
}

export async function loadFullstackManifest(file: string): Promise<FullstackManifest> {
  const loaded = await import(pathToFileURL(file).href + "?t=" + Date.now()) as {
    pages: FullstackPage[];
    apiRoutes: ApiRouteDefinition[];
    notFound?: ComponentType<JavafyPageProps>;
  };
  return loaded;
}

export async function renderFullstackPage(
  manifest: FullstackManifest,
  pathname: string,
  options: { request?: Request; static?: boolean } = {}
): Promise<{ html: string; props: Record<string, unknown>; status: number } | null> {
  const matched = matchRoute(pathname, manifest.pages);
  if (!matched) {
    const notFound = manifest.notFound
      ? createElement(manifest.notFound, { params: {}, pathname })
      : createElement("main", null,
          createElement("h1", null, "404 — Page not found"),
          createElement("p", null, "No Javafy route matches " + pathname)
        );
    return { html: renderToString(notFound), props: {}, status: 404 };
  }
  const page = matched.route;
  if (isDynamicRoute(page.path) && page.getStaticPaths && !page.getServerSideProps) {
    const staticEntries = await page.getStaticPaths();
    const routeParams = [...page.path.matchAll(/([:*])([^/?]+)(\?)?/g)];
    const requiredParams = routeParams.filter((match) => match[3] !== "?").map((match) => match[2] ?? "");
    const allowedParams = routeParams.map((match) => match[2] ?? "");
    const optionalParams = routeParams.filter((match) => match[3] === "?").map((match) => match[2] ?? "");
    const allowed = staticEntries.some((entry) =>
      requiredParams.every((key) => entry.params[key] === matched.params[key]) &&
      Object.keys(entry.params).every((key) =>
        allowedParams.includes(key) && entry.params[key] === matched.params[key]
      ) &&
      optionalParams.every((key) => entry.params[key] !== undefined || matched.params[key] === "")
    );
    if (!allowed) {
      const notFound = manifest.notFound
        ? createElement(manifest.notFound, { params: matched.params, pathname: matched.pathname })
        : createElement("main", null, createElement("h1", null, "404 — Page not found"));
      return { html: renderToString(notFound), props: {}, status: 404 };
    }
  }
  const context: DataContext = {
    params: matched.params,
    pathname: matched.pathname,
    ...(options.request ? { request: options.request, searchParams: new URL(options.request.url).searchParams } : {})
  };
  let props: Record<string, unknown> = {};
  const loader = options.static ? page.getStaticProps : page.getServerSideProps ?? page.getStaticProps;
  if (loader) {
    const result = await loader(context);
    if (result && typeof result === "object") props = result;
  }

  const PageWithData: ComponentType<JavafyPageProps> = (pageProps) =>
    createElement(page.component, { ...props, ...pageProps });
  const Router = createRouter({
    routes: [{
      path: page.path,
      component: PageWithData,
      layouts: page.layouts
    }],
    ...(manifest.notFound ? { notFound: manifest.notFound } : {}),
    initialPathname: pathname
  });
  return { html: renderToString(createElement(Router)), props, status: 200 };
}

export async function getStaticRoutePaths(manifest: FullstackManifest): Promise<string[]> {
  const paths: string[] = [];
  for (const page of manifest.pages) {
    if (!isDynamicRoute(page.path)) {
      if (!page.getServerSideProps) paths.push(page.path);
      continue;
    }
    if (page.getServerSideProps || !page.getStaticPaths) continue;
    const entries = await page.getStaticPaths();
    const tokens = [...page.path.matchAll(/([:*])([^/?]+)(\?)?/g)];
    for (const entry of entries) {
      let pathname = page.path;
      let valid = true;
      for (const token of tokens) {
        const marker = token[0] ?? "";
        const key = token[2] ?? "";
        const optional = token[3] === "?";
        const value = entry.params[key];
        if (value === undefined) {
          if (optional) pathname = pathname.replace(marker, "");
          else valid = false;
          continue;
        }
        const encoded = marker.startsWith("*")
          ? value.split("/").map(encodeURIComponent).join("/")
          : encodeURIComponent(value);
        pathname = pathname.replace(marker, encoded);
      }
      pathname = pathname.replace(/\/+$/, "") || "/";
      if (valid && !/[:*][^/]+/.test(pathname)) paths.push(pathname);
    }
  }
  return [...new Set(paths)];
}
