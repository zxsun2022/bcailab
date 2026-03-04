import { Outlet } from "@remix-run/react";

export const handle = {
  breadcrumb: { label: "reading", href: "/esl/reading" }
};

export default function EslReadingLayout() {
  return <Outlet />;
}
