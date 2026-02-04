import { defineConfig } from "vite";
import { vitePlugin as remix, cloudflareDevProxyVitePlugin } from "@remix-run/dev";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app")
    }
  },
  plugins: [
    cloudflareDevProxyVitePlugin({
      configPath: path.join(rootDir, "wrangler.toml"),
      getLoadContext({ context }) {
        return {
          env: context.cloudflare?.env,
          cf: context.cloudflare?.cf
        };
      }
    }),
    remix({
      serverPlatform: "neutral",
      ignoredRouteFiles: ["**/.*"]
    })
  ],
  build: {
    target: "es2022"
  },
  ssr: {
    noExternal: ["@bcailab/ui", "@bcailab/auth", "@bcailab/db"]
  }
});
