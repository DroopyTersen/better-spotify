import { PageHeader } from "~/layout/PageHeader";
import type { Route } from "./+types/builder.route";
import { BuilderForm } from "./BuilderForm";

export default function Builder({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <PageHeader title="Build Playlist" />
      <div className="max-w-2xl mx-auto">
        <BuilderForm />
      </div>
    </>
  );
}
