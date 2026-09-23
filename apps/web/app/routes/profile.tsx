import { redirect } from "@remix-run/cloudflare";

/** The account page merged into `/settings`; old links and bookmarks land there. */
export const loader = () => redirect("/settings", 301);
