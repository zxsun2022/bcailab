import { Outlet } from "@remix-run/react";

export const handle = {
  breadcrumb: { label: "esl", href: "/esl" }
};

export default function EslLayout() {
  return <Outlet />;
}
