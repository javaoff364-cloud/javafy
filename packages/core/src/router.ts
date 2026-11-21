/** File-based route matching utilities shared by the Javafy router. */

export interface RouteDefinition {
  /** Route pattern: "/", "/about", "/blog/:id", "/docs/*slug", or "/docs/*slug?". */
  path: string;
}

export interface RouteMatch<T extends RouteDefinition = RouteDefinition> {
  route: T;
  params: Record<string, string>;
  pathname: string;
}

function normalizePathname(pathname: string, routePattern = false): string {
  const clean = (routePattern ? pathname : pathname.split("?")[0] ?? "/").split("#")[0] ?? "/";
  const leading = clean.startsWith("/") ? clean : "/" + clean;
  return leading.length > 1 ? leading.replace(/\/+$/, "") : "/";
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function segmentWeight(segment: string): number {
  if (segment.startsWith("*")) return 0;
  if (segment.startsWith(":")) return 1;
  return 2;
}

function compareSpecificity(a: string[], b: string[]): number {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = segmentWeight(b[index] ?? "") - segmentWeight(a[index] ?? "");
    if (difference !== 0) return difference;
  }
  return b.length - a.length;
}

/** Returns whether a route pattern uses valid dynamic parameter syntax. */
export function isValidRoutePattern(pattern: string): boolean {
  const segments = normalizePathname(pattern, true).split("/").filter(Boolean);
  const names = new Set<string>();

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? "";
    if (segment.startsWith(":")) {
      const name = segment.slice(1);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || names.has(name)) return false;
      names.add(name);
      continue;
    }

    if (segment.startsWith("*")) {
      const optional = segment.endsWith("?");
      const name = segment.slice(1, optional ? -1 : undefined);
      if (index !== segments.length - 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || names.has(name)) return false;
      names.add(name);
      continue;
    }

    // Static segments cannot contain route-parameter syntax.
    if (segment.includes(":") || segment.includes("*")) return false;
  }
  return true;
}

/** Match routes by segment specificity. Static segments outrank dynamic and catch-all segments. */
export function matchRoute<T extends RouteDefinition>(
  pathname: string,
  routes: readonly T[]
): RouteMatch<T> | null {
  const current = normalizePathname(pathname);
  const currentSegments = current.split("/").filter(Boolean);
  const ranked = routes
    .filter((route) => isValidRoutePattern(route.path))
    .map((route, index) => ({
      route,
      index,
      segments: normalizePathname(route.path, true).split("/").filter(Boolean)
    }))
    .sort((a, b) => compareSpecificity(a.segments, b.segments) || a.index - b.index);

  for (const candidate of ranked) {
    const params: Record<string, string> = {};
    let currentIndex = 0;
    let matched = true;

    for (let index = 0; index < candidate.segments.length; index += 1) {
      const expected = candidate.segments[index] ?? "";

      if (expected.startsWith("*")) {
        if (index !== candidate.segments.length - 1) {
          matched = false;
          break;
        }
        const optional = expected.endsWith("?");
        const name = expected.slice(1, optional ? -1 : undefined);
        const remaining = currentSegments.slice(currentIndex);
        if (!optional && remaining.length === 0) {
          matched = false;
          break;
        }
        const decoded = remaining.map(decodeSegment);
        if (decoded.some((value) => value === null)) {
          matched = false;
          break;
        }
        params[name] = (decoded as string[]).join("/");
        // Catch-all segments are terminal, so they consume the remainder,
        // including zero segments when the catch-all is optional.
        return { route: candidate.route, params, pathname: current };
      }

      const actual = currentSegments[currentIndex];
      if (actual === undefined) {
        matched = false;
        break;
      }
      const decodedActual = decodeSegment(actual);
      const decodedExpected = expected.startsWith(":") ? null : decodeSegment(expected);
      if (decodedActual === null) {
        matched = false;
        break;
      }
      if (expected.startsWith(":")) {
        params[expected.slice(1)] = decodedActual;
      } else if (decodedExpected !== decodedActual) {
        matched = false;
        break;
      }
      currentIndex += 1;
    }

    if (matched && currentIndex === currentSegments.length) {
      return { route: candidate.route, params, pathname: current };
    }
  }
  return null;
}
