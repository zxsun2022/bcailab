import { Outlet } from "@remix-run/react";

export const handle = {
  breadcrumb: { label: "speech", href: "/tts" }
};

export default function TtsLayout() {
  return <Outlet />;
}
