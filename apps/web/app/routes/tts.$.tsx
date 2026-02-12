import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export const loader = ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const splat = params["*"] ?? "";
  return redirect(`/speech/${splat}${url.search}`, 301);
};
