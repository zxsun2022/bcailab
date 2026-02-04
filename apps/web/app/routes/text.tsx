import { Outlet } from "@remix-run/react";

export const handle = {
  breadcrumb: { label: "Text" }
};

export default function TextLayout() {
  return <Outlet />;
}
