import { PageHeader } from "~/layout/PageHeader";
import type { Route } from "./+types/builder.route";
import { PlaylistBuilder } from "./PlaylistBuilder";

export default function Builder({ loaderData }: Route.ComponentProps) {
  console.log("🚀 | Home | loaderData:", loaderData);
  return (
    <>
      <PageHeader title="Dashboard" />
      <PlaylistBuilder />
    </>
  );
}
