/** Javafy core public API. */

export interface JavafyConfig {
  name?: string;
  dev?: {
    host?: string;
    port?: number;
  };
  publicDir?: string;
}

export const defaultConfig: Required<JavafyConfig> = {
  name: "Javafy App",
  dev: { host: "localhost", port: 3000 },
  publicDir: "public"
};

export function defineConfig(config: JavafyConfig): JavafyConfig {
  return config;
}

export function resolveConfig(config: JavafyConfig = {}): Required<JavafyConfig> {
  return {
    name: config.name ?? defaultConfig.name,
    dev: {
      host: config.dev?.host ?? defaultConfig.dev.host,
      port: config.dev?.port ?? defaultConfig.dev.port
    },
    publicDir: config.publicDir ?? defaultConfig.publicDir
  };
}

export const JAVAFY_VERSION = "0.2.0";
