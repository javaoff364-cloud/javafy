/** Javafy server runtime primitives. */
import { matchRoute, type RouteDefinition } from "@javafy/core";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";
export interface ApiRouteContext {
  params: Record<string, string>;
  pathname: string;
}
export type ApiRouteHandler = (request: Request, context: ApiRouteContext) => Response | Promise<Response>;
export interface ApiRouteDefinition extends RouteDefinition {
  GET?: ApiRouteHandler;
  POST?: ApiRouteHandler;
  PUT?: ApiRouteHandler;
  PATCH?: ApiRouteHandler;
  DELETE?: ApiRouteHandler;
  OPTIONS?: ApiRouteHandler;
  HEAD?: ApiRouteHandler;
}

const METHODS: ApiMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

function allowedMethods(route: ApiRouteDefinition): ApiMethod[] {
  const methods = METHODS.filter((method) => typeof route[method] === "function");
  if (route.GET && !methods.includes("HEAD")) methods.push("HEAD");
  if (!methods.includes("OPTIONS")) methods.push("OPTIONS");
  return methods;
}

/** Creates a Web Request/Response API dispatcher for static and dynamic route patterns. */
export function createApiRouter(routes: readonly ApiRouteDefinition[]) {
  return async function handleApiRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = matchRoute(url.pathname, routes);
    if (!match) {
      return Response.json(
        { error: "Not Found", message: "No API route matches " + url.pathname },
        { status: 404 }
      );
    }

    const route = match.route;
    const method = request.method.toUpperCase() as ApiMethod;
    const allowed = allowedMethods(route);

    if (method === "OPTIONS" && !route.OPTIONS) {
      return new Response(null, { status: 204, headers: { Allow: allowed.join(", ") } });
    }

    const handler = method === "HEAD" ? route.HEAD ?? route.GET : route[method];
    if (!handler) {
      return Response.json(
        { error: "Method Not Allowed", message: method + " is not supported for " + url.pathname },
        { status: 405, headers: { Allow: allowed.join(", ") } }
      );
    }

    try {
      const response = await handler(request, { params: match.params, pathname: match.pathname });
      if (!(response instanceof Response)) {
        throw new TypeError("Javafy API handlers must return a Web Response.");
      }
      if (method === "HEAD") {
        return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      if (method === "OPTIONS") {
        const headers = new Headers(response.headers);
        if (!headers.has("Allow")) headers.set("Allow", allowed.join(", "));
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }
      return response;
    } catch (error) {
      // Never expose exception messages or stack details to API clients.
      return Response.json(
        { error: "Internal Server Error", message: "An unexpected error occurred." },
        { status: 500 }
      );
    }
  };
}
