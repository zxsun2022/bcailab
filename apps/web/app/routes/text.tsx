import { Outlet } from "@remix-run/react";

export const handle = {
  breadcrumb: { label: "text", href: "/text" }
};

export default function TextLayout() {
  return <Outlet />;
}
