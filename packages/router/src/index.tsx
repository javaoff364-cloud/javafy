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
  navigate: (to: string, options?: { replace?: boolean }) => void;
  back: () => void;
  forward: () => void;
}

const RouterContext = createContext<JavafyRouterValue | null>(null);
const NAVIGATION_EVENT = "javafy:navigate";

/** Navigate without a full page reload. */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  if (options.replace) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

/** Access the current route and navigation methods inside a Javafy page or layout. */
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
    const [pathname, setPathname] = useState(
      options.initialPathname ?? (typeof window === "undefined" ? "/" : window.location.pathname)
    );

    useEffect(() => {
      const update = () => setPathname(window.location.pathname);
      window.addEventListener("popstate", update);
      window.addEventListener(NAVIGATION_EVENT, update);
      return () => {
        window.removeEventListener("popstate", update);
        window.removeEventListener(NAVIGATION_EVENT, update);
      };
    }, []);

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
      navigate,
      back: () => window.history.back(),
      forward: () => window.history.forward()
    }), [pathname, params]);

    return createElement(RouterContext.Provider, { value }, content);
  };

  return Router;
}
