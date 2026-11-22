/** Javafy server runtime primitives. */
import { matchRoute, validateRouteDefinitions, type RouteDefinition } from "@javafy/core";

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
export function createApiRouter(
  routes: readonly ApiRouteDefinition[],
  middleware: readonly JavafyMiddleware[] = []
) {
  validateRouteDefinitions(routes);
  const handleApiRequest = async function handleApiRequest(request: Request): Promise<Response> {
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
      // Malformed JSON is a client input error; all other exceptions stay private.
      if (error instanceof SyntaxError) {
        return Response.json(
          { error: "Bad Request", message: "The request body contains invalid JSON." },
          { status: 400 }
        );
      }
      return Response.json(
        { error: "Internal Server Error", message: "An unexpected error occurred." },
        { status: 500 }
      );
    }
  };

  return createMiddlewareHandler(middleware, handleApiRequest);
}


/**
 * A request middleware receives the current Web Request and may either return
 * a Response or pass control to the next middleware/route handler.
 *
 * Passing a replacement Request to next() lets middleware rewrite request
 * metadata without mutating the original Request.
 */
export type MiddlewareNext = (request?: Request) => Promise<Response>;
export type JavafyMiddleware = (
  request: Request,
  next: MiddlewareNext
) => Response | Promise<Response>;

/**
 * Composes request middleware into a single Web Request handler.
 *
 * Middleware executes in registration order on the way in and reverse order
 * on the way out. A middleware may short-circuit by returning a Response
 * without calling next(). Calling next() more than once is rejected.
 */
export function createMiddlewareHandler(
  middleware: readonly JavafyMiddleware[],
  handler: (request: Request) => Response | Promise<Response>
): (request: Request) => Promise<Response> {
  return async function handleRequest(request: Request): Promise<Response> {
    const dispatch = async (index: number, currentRequest: Request): Promise<Response> => {
      if (index === middleware.length) {
        const response = await handler(currentRequest);
        if (!(response instanceof Response)) {
          throw new TypeError("Javafy request handlers must return a Web Response.");
        }
        return response;
      }

      const current = middleware[index];
      if (!current) {
        throw new Error("Javafy middleware pipeline is invalid.");
      }

      let nextCalled = false;
      const next: MiddlewareNext = async (replacementRequest) => {
        if (nextCalled) {
          throw new Error("Javafy middleware next() may only be called once.");
        }
        nextCalled = true;
        return dispatch(index + 1, replacementRequest ?? currentRequest);
      };

      const response = await current(currentRequest, next);
      if (!(response instanceof Response)) {
        throw new TypeError("Javafy middleware must return a Web Response.");
      }
      return response;
    };

    return dispatch(0, request);
  };
}
