// Wrangler generates every configured binding in worker-configuration.d.ts. Secrets are not
// written to wrangler.jsonc, so this declaration is the only hand-maintained environment field.
declare namespace Cloudflare {
  interface Env {
    MAPDOWN_HANDOFF_SECRET: string;
  }
}
