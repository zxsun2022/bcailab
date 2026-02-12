import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export const handle = {
  breadcrumb: { label: "history" }
};

export const loader = async (_args: LoaderFunctionArgs) => redirect("/speech");

export const action = async (_args: ActionFunctionArgs) => redirect("/speech");

export default function TtsHistoryRedirectPage() {
  return null;
}
