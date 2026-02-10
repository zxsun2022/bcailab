import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/posts${url.search}`, { status: 301 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/posts${url.search}`, { status: 307 });
};

export default function LegacyTextIndex() {
  return null;
}
