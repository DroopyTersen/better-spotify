import { PageHeader } from "~/layout/PageHeader";
import type { Route } from "./+types/home";
import { LoaderFunctionArgs, redirect } from "react-router";
import { requireAuth } from "~/auth/auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let user = await requireAuth(request);
  return redirect("/play-history");
};
export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <PageHeader>Dashboard</PageHeader>
    </>
  );
}
