import {
  Component,
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ComponentType,
  type ErrorInfo,
  type FocusEvent,
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

export interface JavafyErrorProps extends JavafyPageProps {
  error: Error;
  reset: () => void;
}

export interface JavafyRoute extends RouteDefinition {
  component: ComponentType<JavafyPageProps>;
  layouts?: ComponentType<JavafyLayoutProps>[];
  loading?: ComponentType<JavafyPageProps>;
  error?: ComponentType<JavafyErrorProps>;
  props?: Record<string, unknown>;
}

export interface JavafyRouterValue extends JavafyPageProps {
  searchParams: URLSearchParams;
  hash: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  back: () => void;
  forward: () => void;
  prefetch: (to: string) => void;
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

class RouteErrorBoundary extends Component<{
  fallback?: ComponentType<JavafyErrorProps>;
  params: Record<string, string>;
  pathname: string;
  children: ReactNode;
}, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[Javafy diagnostics] Route render failed for " + this.props.pathname, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return createElement(this.props.fallback, {
          error: this.state.error,
          reset: this.reset,
          params: this.props.params,
          pathname: this.props.pathname
        });
      }
      return createElement("main", { role: "alert" },
        createElement("h1", null, "Something went wrong"),
        createElement("p", null, "This page could not be rendered."),
        createElement("button", { type: "button", onClick: this.reset }, "Try again")
      );
    }
    return this.props.children;
  }
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
  onMouseEnter,
  onFocus,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; replace?: boolean }) {
  const router = useContext(RouterContext);
  const prefetch = () => {
    if (!router || typeof window === "undefined") return;
    const url = new URL(href, window.location.href);
    if (url.origin === window.location.origin) router.prefetch(url.pathname + url.search);
  };
  return createElement("a", {
    ...props,
    href,
    onMouseEnter: (event: MouseEvent<HTMLAnchorElement>) => {
      onMouseEnter?.(event);
      if (!event.defaultPrevented) prefetch();
    },
    onFocus: (event: FocusEvent<HTMLAnchorElement>) => {
      onFocus?.(event);
      if (!event.defaultPrevented) prefetch();
    },
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
  loadData?: (url: URL, signal?: AbortSignal) => Promise<JavafyNavigationData>;
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
    const [isNavigating, setIsNavigating] = useState(false);
    const navigationId = useRef(0);
    const activeNavigation = useRef<AbortController | null>(null);
    const prefetchedData = useRef(new Map<string, Promise<JavafyNavigationData>>());

    const prefetch = (to: string) => {
      if (!options.loadData || typeof window === "undefined") return;
      const url = new URL(to, window.location.href);
      if (url.origin !== window.location.origin) return;
      const key = url.pathname + url.search;
      if (prefetchedData.current.has(key)) return;

      const pending = options.loadData(url).catch((error) => {
        prefetchedData.current.delete(key);
        throw error;
      });
      // A hover/focus prefetch may never be consumed; handle its rejection now.
      void pending.catch(() => {});
      // Bound memory if a user explores many links without navigating.
      if (prefetchedData.current.size >= 32) {
        const oldest = prefetchedData.current.keys().next().value;
        if (oldest !== undefined) prefetchedData.current.delete(oldest);
      }
      prefetchedData.current.set(key, pending);
    };

    useEffect(() => {
      let active = true;
      const update = async () => {
        const nextLocation = readBrowserLocation();
        const currentId = ++navigationId.current;
        activeNavigation.current?.abort();
        activeNavigation.current = null;
        setLocation(nextLocation);
        if (!options.loadData) {
          setNavigationData({ status: 200, props: {} });
          setIsNavigating(false);
          return;
        }
        setIsNavigating(true);
        const controller = new AbortController();
        activeNavigation.current = controller;
        try {
          const url = new URL(window.location.href);
          const key = url.pathname + url.search;
          const cached = prefetchedData.current.get(key);
          const result = await (cached ?? options.loadData(url, controller.signal));
          prefetchedData.current.delete(key);
          if (active && navigationId.current === currentId && !controller.signal.aborted) {
            activeNavigation.current = null;
            setNavigationData(result);
            setIsNavigating(false);
          }
        } catch (error) {
          if (active && navigationId.current === currentId && !controller.signal.aborted) {
            activeNavigation.current = null;
            setNavigationData({
              status: 500,
              props: { __javafyNavigationError: error instanceof Error ? error.message : "Navigation failed" }
            });
            setIsNavigating(false);
          }
        }
      };
      window.addEventListener("popstate", update);
      window.addEventListener(NAVIGATION_EVENT, update);
      return () => {
        active = false;
        activeNavigation.current?.abort();
        activeNavigation.current = null;
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
    const page = navigationFailed && route?.error
      ? createElement(route.error, {
          error: new Error(String(pageProps.__javafyNavigationError ?? "Navigation failed")),
          reset: () => navigate(pathname + location.search + location.hash),
          params,
          pathname
        })
      : navigationFailed
        ? createElement("main", { role: "alert" },
            createElement("h1", null, "Navigation failed"),
            createElement("p", null, "Javafy could not load this page. Please try again.")
          )
        : isNavigating && route?.loading
          ? createElement(route.loading, { params, pathname })
          : route
            ? createElement(route.component, { ...pageProps, params, pathname })
          : options.notFound
          ? createElement(options.notFound, { params, pathname })
          : createElement("main", null,
              createElement("h1", null, "404 — Page not found"),
              createElement("p", null, `No Javafy route matches ${pathname}`)
            );

    const routedContent = route
      ? (route.layouts ?? []).reduceRight<ReactNode>(
          (child, Layout) => createElement(Layout, { children: child, ...pageProps, params, pathname }),
          page
        )
      : page;
    const content = route
      ? createElement(RouteErrorBoundary, {
          key: pathname,
          fallback: route.error,
          params,
          pathname,
          children: routedContent
        })
      : routedContent;

    const value = useMemo<JavafyRouterValue>(() => ({
      pathname,
      params,
      searchParams: new URLSearchParams(location.search),
      hash: location.hash,
      navigate,
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      prefetch
    }), [location, params]);

    return createElement(RouterContext.Provider, { value }, content);
  };

  return Router;
}
