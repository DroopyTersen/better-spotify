import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { SidebarLayout } from "~/components/layout/SidebarLayout";
import { LoaderFunctionArgs } from "react-router";
import { requireAuth } from "~/auth/auth.server";
import { json } from "node:stream/consumers";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let user = await requireAuth(request);
  console.log("USER", user);
  return { user };
};

export default function Home() {
  return (
    <SidebarLayout>
      <h1>Home</h1>
      <Welcome />
    </SidebarLayout>
  );
}
