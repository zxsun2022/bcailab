/** @type {import('@remix-run/dev').AppConfig} */
export default {
  appDirectory: "app",
  assetsBuildDirectory: "build/client",
  publicPath: "/build/",
  serverBuildPath: "build/server/index.js",
  serverModuleFormat: "esm",
  serverPlatform: "neutral",
  ignoredRouteFiles: ["**/.*"],
  serverDependenciesToBundle: ["@bcailab/ui", "@bcailab/auth", "@bcailab/db"]
};
