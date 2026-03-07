import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

const getCanonicalReadingPath = (request: Request) => {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/^\/esl\/reading(?=\/|$)/, "/reading");
  return `${pathname}${url.search}`;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return redirect(getCanonicalReadingPath(request), { status: 308 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return redirect(getCanonicalReadingPath(request), { status: 308 });
};

export default function LegacyEslReadingIndexRedirect() {
  return null;
}
