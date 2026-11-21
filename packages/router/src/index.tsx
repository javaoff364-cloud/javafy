import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ComponentType,
  type MouseEvent,
  type ReactNode
} from "react";
import { matchRoute, type RouteDefinition } from "@javafy/core";

export interface JavafyPageProps {
  params: Record<string, string>;
  pathname: string;
  [key: string]: unknown;
}

export interface JavafyLayoutProps extends JavafyPageProps {
  children: ReactNode;
}

export interface JavafyRoute extends RouteDefinition {
  component: ComponentType<JavafyPageProps>;
  layouts?: ComponentType<JavafyLayoutProps>[];
  props?: Record<string, unknown>;
}

export interface JavafyRouterValue extends JavafyPageProps {
  /** Current URL query parameters. Updated on push, replace, and browser history navigation. */
  searchParams: URLSearchParams;
  /** Current URL hash, including the leading #, or an empty string. */
  hash: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  back: () => void;
  forward: () => void;
}

interface LocationSnapshot {
  pathname: string;
  search: string;
  hash: string;
}

const RouterContext = createContext<JavafyRouterValue | null>(null);
const NAVIGATION_EVENT = "javafy:navigate";

function getLocationSnapshot(input: string): LocationSnapshot {
  const url = new URL(input, "http://javafy.local");
  return { pathname: url.pathname, search: url.search, hash: url.hash };
}

function readBrowserLocation(): LocationSnapshot {
  return getLocationSnapshot(window.location.href);
}

/** Navigate without a full page reload when the application is running in SPA mode. */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  if ((window as Window & { __JAVAFY_FULLSTACK__?: boolean }).__JAVAFY_FULLSTACK__) {
    window.location.assign(url.href);
    return;
  }
  if (options.replace) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

/** Access the current route, URL state, and navigation methods inside a Javafy page or layout. */
export function useRouter(): JavafyRouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error("useRouter must be used inside a Javafy router.");
  return value;
}

/** An anchor that uses client-side navigation for same-origin links. */
export function Link({
  href,
  replace,
  onClick,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; replace?: boolean }) {
  return createElement("a", {
    ...props,
    href,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        props.target === "_blank"
      ) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      navigate(url.pathname + url.search + url.hash, { replace });
    }
  }, children);
}

/** Create the React router component used by Javafy's generated route entry. */
export function createRouter(options: {
  routes: JavafyRoute[];
  notFound?: ComponentType<JavafyPageProps>;
  initialPathname?: string;
}): ComponentType {
  const Router = function JavafyRouter() {
    const [location, setLocation] = useState<LocationSnapshot>(() =>
      options.initialPathname
        ? getLocationSnapshot(options.initialPathname)
        : typeof window === "undefined"
          ? getLocationSnapshot("/")
          : readBrowserLocation()
    );

    useEffect(() => {
      const update = () => setLocation(readBrowserLocation());
      window.addEventListener("popstate", update);
      window.addEventListener(NAVIGATION_EVENT, update);
      return () => {
        window.removeEventListener("popstate", update);
        window.removeEventListener(NAVIGATION_EVENT, update);
      };
    }, []);

    const { pathname } = location;
    const matched = useMemo(
      () => matchRoute(pathname, options.routes),
      [pathname]
    );
    const params = matched?.params ?? {};
    const route = matched?.route;
    const page = route
      ? createElement(route.component, { ...(route.props ?? {}), params, pathname })
      : options.notFound
        ? createElement(options.notFound, { params, pathname })
        : createElement("main", null,
            createElement("h1", null, "404 — Page not found"),
            createElement("p", null, `No Javafy route matches ${pathname}`)
          );

    const content = route
      ? (route.layouts ?? []).reduceRight<ReactNode>(
          (child, Layout) => createElement(Layout, { children: child, params, pathname }),
          page
        )
      : page;

    const value = useMemo<JavafyRouterValue>(() => ({
      pathname,
      params,
      searchParams: new URLSearchParams(location.search),
      hash: location.hash,
      navigate,
      back: () => window.history.back(),
      forward: () => window.history.forward()
    }), [location, params]);

    return createElement(RouterContext.Provider, { value }, content);
  };

  return Router;
}
