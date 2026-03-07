import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.searchParams);
  const target = params.toString() ? `/posts?${params.toString()}` : "/posts";
  return redirect(target, { status: 301 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.searchParams);
  const target = params.toString() ? `/posts?${params.toString()}` : "/posts";
  return redirect(target, { status: 307 });
};

export default function PostsListRedirect() {
  return null;
}
