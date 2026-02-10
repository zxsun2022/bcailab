import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  return redirect(`/posts/${id}${url.search}`, { status: 301 });
};

export default function LegacyTextPost() {
  return null;
}
