import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { createRouter, type JavafyErrorProps, type JavafyLayoutProps, type JavafyPageProps } from "@javafy/router";
import { matchRoute, type RouteDefinition } from "@javafy/core";
import type { ApiRouteDefinition, JavafyMiddleware } from "@javafy/server";
import { terminal } from "./terminal.js";
import { build } from "esbuild";
import { createJavafySourcePlugin, JAVAFY_RESOLVE_EXTENSIONS } from "./native-files.js";

type DataContext = {
  params: Record<string, string>;
  pathname: string;
  request?: Request;
  searchParams?: URLSearchParams;
};

type StaticPathEntry = { params: Record<string, string> };
type StaticPathsResult = StaticPathEntry[] | { paths: StaticPathEntry[]; fallback?: false | "blocking" };
type DataResult = Record<string, unknown> | void | null;
type DataLoader = (context: DataContext) => DataResult | Promise<DataResult>;

type PageModule = {
  default: ComponentType<JavafyPageProps>;
  getServerSideProps?: DataLoader;
  getStaticProps?: DataLoader;
  getStaticPaths?: () => StaticPathsResult | Promise<StaticPathsResult>;
  revalidate?: number;
  getCacheKey?: (context: DataContext) => string;
};

type LayoutModule = { default: ComponentType<JavafyLayoutProps> };

export interface FullstackPage extends RouteDefinition {
  component: ComponentType<JavafyPageProps>;
  layouts: ComponentType<JavafyLayoutProps>[];
  getServerSideProps?: DataLoader;
  getStaticProps?: DataLoader;
  getStaticPaths?: PageModule["getStaticPaths"];
  revalidate?: number;
  getCacheKey?: PageModule["getCacheKey"];
  loading?: ComponentType<JavafyPageProps>;
  error?: ComponentType<JavafyErrorProps>;
}

export interface FullstackManifest {
  pages: FullstackPage[];
  apiRoutes: ApiRouteDefinition[];
  notFound?: ComponentType<JavafyPageProps>;
  middleware?: JavafyMiddleware;
}

export interface DiscoveredFiles {
  pages: Array<{ path: string; page: string; layouts: string[]; loading?: string; error?: string }>;
  api: Array<{ path: string; file: string }>;
  notFound?: string;
  middleware?: string;
  watchDirs: string[];
}

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const;

interface LoaderCacheEntry {
  expiresAt: number;
  props: Record<string, unknown>;
}

const loaderCache = new Map<string, LoaderCacheEntry>();
const MAX_LOADER_CACHE_ENTRIES = 500;

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
    const pageFile = findFile(directory, ["page.jfx", "page.jfy", "page.tsx", "page.jf", "page.ts"]);
    const loadingFile = findFile(directory, ["loading.jfx", "loading.jfy", "loading.tsx", "loading.jf", "loading.ts"]);
    let inheritedLoading = findFile(appDir, ["loading.jfx", "loading.jfy", "loading.tsx", "loading.jf", "loading.ts"]);
    let inheritedError = findFile(appDir, ["error.jfx", "error.jfy", "error.tsx", "error.jf", "error.ts"]);
    let loadingParent = appDir;
    let errorParent = appDir;
    for (const segment of segments) {
      loadingParent = resolve(loadingParent, segment);
      errorParent = resolve(errorParent, segment);
      inheritedLoading = findFile(loadingParent, ["loading.jfx", "loading.jfy", "loading.tsx", "loading.jf", "loading.ts"]) ?? inheritedLoading;
      inheritedError = findFile(errorParent, ["error.jfx", "error.jfy", "error.tsx", "error.jf", "error.ts"]) ?? inheritedError;
    }
    const apiFile = findFile(directory, ["route.jfa", "route.jf", "route.ts", "route.tsx"]);
    const rootLayout = findFile(appDir, ["layout.jfx", "layout.jfc", "layout.jfy", "layout.tsx", "layout.jf", "layout.ts"]);
    if (pageFile) {
      const layouts: string[] = [];
      if (rootLayout) layouts.push(rootLayout);
      let parent = appDir;
      for (const segment of segments) {
        parent = resolve(parent, segment);
        const layout = findFile(parent, ["layout.jfx", "layout.jfc", "layout.jfy", "layout.tsx", "layout.jf", "layout.ts"]);
        if (layout && !layouts.includes(layout)) layouts.push(layout);
      }
      pages.push({
        path: segments.length ? "/" + segments.map(routeSegment).join("/") : "/",
        page: pageFile,
        layouts,
        ...((loadingFile ?? inheritedLoading) ? { loading: loadingFile ?? inheritedLoading } : {}),
        ...(inheritedError ? { error: inheritedError } : {})
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

  const notFound = ["404.jf", "404.jfx", "not-found.jfx", "not-found.jfy", "not-found.tsx", "not-found.jf", "not-found.ts"].map((name) => resolve(appDir, name)).find(existsSync);
  const middleware = findFile(appDir, ["middleware.jf", "middleware.ts"]);
  walk(appDir, []);
  return { pages, api, ...(notFound ? { notFound } : {}), ...(middleware ? { middleware } : {}), watchDirs };
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
    if (page.loading) importFor(page.loading);
    if (page.error) importFor(page.error);
  }
  for (const route of discovered.api) importFor(route.file);
  if (discovered.notFound) importFor(discovered.notFound);
  if (discovered.middleware) importFor(discovered.middleware);

  const source = [
    ...[...imports.entries()].map(([file, name]) => `import * as ${name} from ${JSON.stringify(file)};`),
    "export const pages = [",
    ...discovered.pages.map((page) => {
      const mod = importFor(page.page);
      const layouts = page.layouts.map((file) => `${importFor(file)}.default`);
      const loading = page.loading ? `${importFor(page.loading)}.default` : "undefined";
      const error = page.error ? `${importFor(page.error)}.default` : "undefined";
      return `  { path: ${JSON.stringify(page.path)}, component: ${mod}.default, layouts: [${layouts.join(", ")}], loading: ${loading}, error: ${error}, getServerSideProps: ${mod}.getServerSideProps, getStaticProps: ${mod}.getStaticProps, getStaticPaths: ${mod}.getStaticPaths, revalidate: ${mod}.revalidate, getCacheKey: ${mod}.getCacheKey },`;
    }),
    "];",
    "export const apiRoutes = [",
    ...discovered.api.map((route) => {
      const mod = importFor(route.file);
      return `  { path: ${JSON.stringify(route.path)}, ${methods.map((method) => `${method}: ${mod}.${method}`).join(", ")} },`;
    }),
    "];",
    `export const notFound = ${discovered.notFound ? importFor(discovered.notFound) + ".default" : "undefined"};`,
    `export const middleware = ${discovered.middleware ? importFor(discovered.middleware) + ".default" : "undefined"};`
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
    plugins: [createJavafySourcePlugin()],
    resolveExtensions: JAVAFY_RESOLVE_EXTENSIONS,
    sourcemap: false,
    logLevel: "silent"
  });
}

export async function loadFullstackManifest(file: string): Promise<FullstackManifest> {
  const loaded = await import(pathToFileURL(file).href + "?t=" + Date.now()) as {
    pages: FullstackPage[];
    apiRoutes: ApiRouteDefinition[];
    notFound?: ComponentType<JavafyPageProps>;
    middleware?: JavafyMiddleware;
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
    const staticResult = await page.getStaticPaths();
    const staticEntries = Array.isArray(staticResult) ? staticResult : staticResult.paths;
    const fallbackMode = Array.isArray(staticResult) ? false : staticResult.fallback ?? false;
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
    if (!allowed && fallbackMode !== "blocking") {
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
  let cacheKey: string | undefined;
  const cacheSeconds = !options.static && page.getServerSideProps &&
    Number.isInteger(page.revalidate) && (page.revalidate ?? 0) > 0 && page.getCacheKey
    ? Math.floor(page.revalidate as number)
    : 0;
  if (cacheSeconds > 0 && page.getCacheKey) {
    try {
      const customKey = page.getCacheKey(context);
      if (typeof customKey === "string" && customKey.trim()) {
        const identity = options.request
          ? [options.request.headers.get("authorization") ?? "", options.request.headers.get("cookie") ?? ""].join("\\n")
          : "public";
        const scope = createHash("sha256").update(identity).digest("hex");
        cacheKey = page.path + ":" + JSON.stringify(matched.params) + ":" + customKey + ":" + scope;
      }
    } catch (error) {
      terminal.error("[Javafy diagnostics] getCacheKey failed for " + page.path, error);
    }
  }
  const cacheEntry = cacheKey ? loaderCache.get(cacheKey) : undefined;
  const cached = cacheEntry && cacheEntry.expiresAt > Date.now() ? cacheEntry : undefined;
  if (cached) props = cached.props;
  else if (cacheEntry && cacheKey) loaderCache.delete(cacheKey);
  if (loader && !cached) {
    try {
      const result = await loader(context);
      if (result && typeof result === "object") props = result;
      if (cacheKey && cacheSeconds > 0 && !options.request?.signal.aborted) {
        if (loaderCache.size >= MAX_LOADER_CACHE_ENTRIES) {
          const oldest = loaderCache.keys().next().value;
          if (oldest !== undefined) loaderCache.delete(oldest);
        }
        loaderCache.set(cacheKey, { props, expiresAt: Date.now() + cacheSeconds * 1000 });
      }
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      terminal.error("[Javafy diagnostics] Server data loader failed for " + page.path, error);
      const fallback = page.error
        ? createElement(page.error, { error, reset: () => {}, params: matched.params, pathname: matched.pathname })
        : createElement("main", { role: "alert" },
            createElement("h1", null, "Something went wrong"),
            createElement("p", null, "This page data could not be loaded.")
          );
      return { html: renderToString(fallback), props: {}, status: 500 };
    }
  }

  const PageWithData: ComponentType<JavafyPageProps> = (pageProps) =>
    createElement(page.component, { ...props, ...pageProps });
  const Router = createRouter({
    routes: [{
      path: page.path,
      component: PageWithData,
      layouts: page.layouts,
      ...(page.error ? { error: page.error } : {})
    }],
    ...(manifest.notFound ? { notFound: manifest.notFound } : {}),
    initialPathname: options.request
      ? new URL(options.request.url).pathname + new URL(options.request.url).search
      : pathname
  });
  try {
    return { html: renderToString(createElement(Router)), props, status: 200 };
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught));
    terminal.error("[Javafy diagnostics] Server render failed for " + page.path, error);
    const fallback = page.error
      ? createElement(page.error, { error, reset: () => {}, params: matched.params, pathname: matched.pathname })
      : createElement("main", { role: "alert" },
          createElement("h1", null, "Something went wrong"),
          createElement("p", null, "This page could not be rendered.")
        );
    return { html: renderToString(fallback), props: {}, status: 500 };
  }
}

export async function getStaticRoutePaths(manifest: FullstackManifest): Promise<string[]> {
  const paths: string[] = [];
  for (const page of manifest.pages) {
    if (!isDynamicRoute(page.path)) {
      if (!page.getServerSideProps) paths.push(page.path);
      continue;
    }
    if (page.getServerSideProps || !page.getStaticPaths) continue;
    const result = await page.getStaticPaths();
    const entries = Array.isArray(result) ? result : result.paths;
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
