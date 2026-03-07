import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return redirect("/reading", { status: 308 });
};
