/** File-based route matching utilities shared by the Javafy router. */

export interface RouteDefinition {
  /** Route pattern, e.g. "/", "/about", or "/blog/:id". */
  path: string;
}

export interface RouteMatch<T extends RouteDefinition = RouteDefinition> {
  route: T;
  params: Record<string, string>;
  pathname: string;
}

function normalizePathname(pathname: string): string {
  const clean = pathname.split("?")[0]?.split("#")[0] ?? "/";
  const leading = clean.startsWith("/") ? clean : `/${clean}`;
  return leading.length > 1 ? leading.replace(/\/+$/, "") : "/";
}

/** Match a pathname against route patterns. Static segments outrank dynamic ones. */
export function matchRoute<T extends RouteDefinition>(
  pathname: string,
  routes: readonly T[]
): RouteMatch<T> | null {
  const current = normalizePathname(pathname);
  const currentSegments = current.split("/").filter(Boolean);
  const ranked = routes
    .map((route, index) => ({
      route,
      index,
      segments: normalizePathname(route.path).split("/").filter(Boolean),
      score: normalizePathname(route.path)
        .split("/")
        .filter(Boolean)
        .reduce((total, segment) => total + (segment.startsWith(":") ? 1 : 10), 0)
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  for (const candidate of ranked) {
    if (candidate.segments.length !== currentSegments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;

    for (let index = 0; index < candidate.segments.length; index += 1) {
      const expected = candidate.segments[index] ?? "";
      const actual = currentSegments[index] ?? "";
      if (expected.startsWith(":")) {
        try {
          params[expected.slice(1)] = decodeURIComponent(actual);
        } catch {
          matched = false;
          break;
        }
      } else if (expected !== actual) {
        matched = false;
        break;
      }
    }

    if (matched) return { route: candidate.route, params, pathname: current };
  }

  return null;
}
