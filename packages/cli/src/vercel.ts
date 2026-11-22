import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createApiRouter, createMiddlewareHandler } from "@javafy/server";
import { loadFullstackManifest, renderFullstackPage } from "./fullstack.js";

type VercelHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;
const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"
};

async function toWebRequest(incoming: IncomingMessage, url: URL): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  const method = (incoming.method ?? "GET").toUpperCase();
  const chunks: Buffer[] = [];
  if (method !== "GET" && method !== "HEAD") {
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const init: RequestInit = { method, headers };
  if (body) init.body = body as unknown as BodyInit;
  return new Request(url, init);
}

async function send(response: Response, outgoing: ServerResponse): Promise<void> {
  outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

function sendFile(file: string, incoming: IncomingMessage, outgoing: ServerResponse): void {
  outgoing.writeHead(200, {
    "content-type": mimeTypes[extname(file)] ?? "application/octet-stream",
    "content-length": statSync(file).size
  });
  if (incoming.method === "HEAD") outgoing.end();
  else createReadStream(file).pipe(outgoing);
}

/** Node.js serverless adapter for Vercel. */
export function createVercelHandler(options: { root?: string } = {}): VercelHandler {
  const root = resolve(options.root ?? process.cwd());
  const output = resolve(root, "dist");
  const manifestFile = join(output, "server", "manifest.mjs");
  let runtimePromise: Promise<{
    manifest: Awaited<ReturnType<typeof loadFullstackManifest>>;
    api: ReturnType<typeof createApiRouter>;
  }> | undefined;

  const getRuntime = () => {
    if (!runtimePromise) {
      if (!existsSync(manifestFile)) {
        throw new Error("Javafy server manifest not found. Run javafy build before deploying to Vercel.");
      }
      runtimePromise = loadFullstackManifest(manifestFile).then((manifest) => ({
        manifest,
        api: createApiRouter(manifest.apiRoutes, manifest.middleware ? [manifest.middleware] : [])
      }));
    }
    return runtimePromise;
  };

  return async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url ?? "/", "https://javafy-vercel.local");
      const rewrittenPath = url.searchParams.get("__javafy_path");
      if (rewrittenPath?.startsWith("/") && !rewrittenPath.startsWith("//")) {
        url.pathname = rewrittenPath;
        url.searchParams.delete("__javafy_path");
      }
      const pathname = url.pathname;
      const { manifest, api } = await getRuntime();
      const request = await toWebRequest(incoming, url);

      if (pathname === "/api" || pathname.startsWith("/api/")) {
        await send(await api(request), outgoing);
        return;
      }

      if (pathname === "/__javafy/data") {
        const targetPath = url.searchParams.get("url");
        if (!targetPath?.startsWith("/") || targetPath.startsWith("//")) {
          await send(Response.json({ error: "Invalid navigation URL." }, { status: 400 }), outgoing);
          return;
        }
        const target = new URL(targetPath, url.origin);
        const navigation = new Request(target, { headers: request.headers, signal: request.signal });
        const response = await createMiddlewareHandler(
          manifest.middleware ? [manifest.middleware] : [],
          async (current) => {
            const rendered = await renderFullstackPage(manifest, target.pathname, { request: current });
            return Response.json({ props: rendered?.props ?? {}, status: rendered?.status ?? 404 }, {
              headers: { "cache-control": "no-store" }
            });
          }
        )(navigation);
        await send(response, outgoing);
        return;
      }

      const relativePath = normalize(pathname).replace(/^([/\\])+/, "") || "index.html";
      const file = resolve(output, relativePath);
      if (file !== output && !file.startsWith(output + sep)) {
        outgoing.writeHead(403).end("Forbidden");
        return;
      }
      if (existsSync(file) && statSync(file).isFile()) {
        sendFile(file, incoming, outgoing);
        return;
      }

      const render = async (current: Request) => {
        const rendered = await renderFullstackPage(manifest, pathname, { request: current });
        if (!rendered) return new Response("Javafy: page not found.", { status: 404 });
        const shellFile = join(output, "server", "shell.html");
        const shell = existsSync(shellFile) ? readFileSync(shellFile, "utf8") :
          '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>';
        const data = JSON.stringify({ [pathname]: rendered.props }).replace(/</g, "\\u003c");
        const markup = '<div id="root">' + rendered.html + "</div>";
        const rootPlaceholder = '<div id="root"></div>';
        let document = shell.includes(rootPlaceholder)
          ? shell.replace(rootPlaceholder, markup)
          : shell.includes("</body>") ? shell.replace("</body>", markup + "</body>") : shell + markup;
        const scripts = '<script>window.__JAVAFY_FULLSTACK__=true;window.__JAVAFY_DATA__=' +
          data + ';</script><script type="module" src="/assets/app.js"></script>';
        document = document.includes("</body>")
          ? document.replace("</body>", scripts + "</body>")
          : document + scripts;
        return new Response(document, {
          status: rendered.status,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      };

      await send(await createMiddlewareHandler(
        manifest.middleware ? [manifest.middleware] : [],
        render
      )(request), outgoing);
    } catch (error) {
      outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      outgoing.end(error instanceof Error ? error.message : "Javafy Vercel function failed.");
    }
  };
}

export default createVercelHandler();
