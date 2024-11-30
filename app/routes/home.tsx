import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { SidebarLayout } from "~/components/layout/SidebarLayout";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export default function Home() {
  return (
    <SidebarLayout>
      <h1>Home</h1>
      <Welcome />
    </SidebarLayout>
  );
}
