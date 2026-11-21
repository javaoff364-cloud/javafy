/** Javafy core public API. */

export interface JavafyConfig {
  name?: string;
  dev?: {
    host?: string;
    port?: number;
  };
  publicDir?: string;
  appDir?: string;
}

export const defaultConfig: Required<JavafyConfig> = {
  name: "Javafy App",
  dev: { host: "localhost", port: 3000 },
  publicDir: "public",
  appDir: "src/app"
};

export function defineConfig(config: JavafyConfig): JavafyConfig {
  return config;
}

export function resolveConfig(config: JavafyConfig = {}): Required<JavafyConfig> {
  const resolved: Required<JavafyConfig> = {
    name: config.name ?? defaultConfig.name,
    dev: {
      host: config.dev?.host ?? defaultConfig.dev.host,
      port: config.dev?.port ?? defaultConfig.dev.port
    },
    publicDir: config.publicDir ?? defaultConfig.publicDir,
    appDir: config.appDir ?? defaultConfig.appDir
  };

  if (typeof resolved.name !== "string" || resolved.name.trim() === "") {
    throw new Error("Javafy config: name must be a non-empty string.");
  }
  if (typeof resolved.dev.host !== "string" || resolved.dev.host.trim() === "") {
    throw new Error("Javafy config: dev.host must be a non-empty string.");
  }
  const port = resolved.dev.port;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Javafy config: dev.port must be an integer between 1 and 65535.");
  }
  for (const [key, value] of [["publicDir", resolved.publicDir], ["appDir", resolved.appDir]] as const) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error("Javafy config: " + key + " must be a non-empty path string.");
    }
  }
  return resolved;
}

export { matchRoute, type RouteDefinition, type RouteMatch } from "./router.js";

export const JAVAFY_VERSION = "0.7.0";
