import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  const paramsOut = new URLSearchParams(url.searchParams);
  paramsOut.set("editing", id);
  return redirect(`/posts?${paramsOut.toString()}`, { status: 301 });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  const paramsOut = new URLSearchParams(url.searchParams);
  paramsOut.set("editing", id);
  return redirect(`/posts?${paramsOut.toString()}`, { status: 307 });
};

export default function LegacyTextEdit() {
  return null;
}
