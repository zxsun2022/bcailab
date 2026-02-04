import { createPagesFunctionHandler } from "@remix-run/cloudflare-pages";
// @ts-ignore - this file is generated at build time
import * as build from "../build/server/index.js";

export const onRequest = createPagesFunctionHandler({
  build,
  getLoadContext: (context) => ({
    env: context.env,
    cf: context.cf
  })
});
