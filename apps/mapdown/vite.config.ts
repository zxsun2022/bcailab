import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";
import { resolveMapdownWebOriginForBuild } from "./src/cloud/build-origin";

export default defineConfig(() => {
  const webOrigin = resolveMapdownWebOriginForBuild(process.env);

  return {
    plugins: [react()],
    server: { port: 5174 },
    build: { outDir: "dist" },
    define: webOrigin
      ? { "import.meta.env.VITE_WEB_ORIGIN": JSON.stringify(webOrigin) }
      : undefined
  };
});
