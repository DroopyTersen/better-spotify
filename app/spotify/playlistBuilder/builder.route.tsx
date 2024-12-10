import { PageHeader } from "~/layout/PageHeader";
import type { Route } from "./+types/builder.route";

export default function Builder({ loaderData }: Route.ComponentProps) {
  console.log("🚀 | Home | loaderData:", loaderData);
  return (
    <>
      <PageHeader title="Dashboard" />
    </>
  );
}
