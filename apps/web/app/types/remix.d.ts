import type { AppExecutionContext, Env } from "./env";

declare module "@remix-run/cloudflare" {
  interface AppLoadContext {
    env: Env;
    cf?: IncomingRequestCfProperties;
    ctx?: AppExecutionContext;
  }
}
