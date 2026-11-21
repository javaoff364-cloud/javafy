import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  searchParams: URLSearchParams;
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

export interface JavafyNavigationData {
  props: Record<string, unknown>;
  status: number;
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

/** Navigate with browser history and notify the active Javafy router. */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  if ((window as Window & { __JAVAFY_FULLSTACK__?: boolean }).__JAVAFY_FULLSTACK__) {
    if (options.replace) window.history.replaceState({}, "", url);
    else window.history.pushState({}, "", url);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
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
        props.target === "_blank" ||
        props.download !== undefined
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
  loadData?: (url: URL) => Promise<JavafyNavigationData>;
}): ComponentType {
  const Router = function JavafyRouter() {
    const [location, setLocation] = useState<LocationSnapshot>(() =>
      options.initialPathname
        ? getLocationSnapshot(options.initialPathname)
        : typeof window === "undefined"
          ? getLocationSnapshot("/")
          : readBrowserLocation()
    );
    const [navigationData, setNavigationData] = useState<JavafyNavigationData | null>(null);
    const navigationId = useRef(0);

    useEffect(() => {
      let active = true;
      const update = async () => {
        const nextLocation = readBrowserLocation();
        const currentId = ++navigationId.current;
        setLocation(nextLocation);
        setNavigationData({ status: 200, props: {} });
        if (!options.loadData) return;
        try {
          const url = new URL(window.location.href);
          const result = await options.loadData(url);
          if (active && navigationId.current === currentId) setNavigationData(result);
        } catch (error) {
          if (active && navigationId.current === currentId) {
            setNavigationData({
              status: 500,
              props: { __javafyNavigationError: error instanceof Error ? error.message : "Navigation failed" }
            });
          }
        }
      };
      window.addEventListener("popstate", update);
      window.addEventListener(NAVIGATION_EVENT, update);
      return () => {
        active = false;
        window.removeEventListener("popstate", update);
        window.removeEventListener(NAVIGATION_EVENT, update);
      };
    }, []);

    const { pathname } = location;
    const matched = useMemo(
      () => matchRoute(pathname, options.routes),
      [pathname]
    );
    const notFound = navigationData?.status === 404;
    const navigationFailed = (navigationData?.status ?? 0) >= 500;
    const route = notFound || navigationFailed ? undefined : matched?.route;
    const params = matched?.params ?? {};
    const pageProps = navigationData?.props ?? route?.props ?? {};
    const page = navigationFailed
      ? createElement("main", { role: "alert" },
          createElement("h1", null, "Navigation failed"),
          createElement("p", null, "Javafy could not load this page. Please try again.")
        )
      : route
        ? createElement(route.component, { ...pageProps, params, pathname })
        : options.notFound
        ? createElement(options.notFound, { params, pathname })
        : createElement("main", null,
            createElement("h1", null, "404 — Page not found"),
            createElement("p", null, `No Javafy route matches ${pathname}`)
          );

    const content = route
      ? (route.layouts ?? []).reduceRight<ReactNode>(
          (child, Layout) => createElement(Layout, { children: child, ...pageProps, params, pathname }),
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
