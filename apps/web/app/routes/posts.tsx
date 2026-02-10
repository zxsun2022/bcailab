import { Outlet } from "@remix-run/react";

export const handle = {
  breadcrumb: { label: "posts", href: "/posts" }
};

export default function PostsLayout() {
  return <Outlet />;
}
