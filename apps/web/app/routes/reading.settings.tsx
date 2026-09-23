import { redirect } from "@remix-run/cloudflare";

/** Settings are shared by every tool now and live on one page; old links land there. */
export const loader = () => redirect("/settings", 301);
