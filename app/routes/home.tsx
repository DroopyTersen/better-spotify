import { PageHeader } from "~/layout/PageHeader";
import type { Route } from "./+types/home";
import { LoaderFunctionArgs } from "react-router";
import { requireAuth } from "~/auth/auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let user = await requireAuth(request);
  return {};
};
export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <PageHeader title="Dashboard" />
    </>
  );
}
