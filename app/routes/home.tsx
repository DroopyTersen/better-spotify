import { LoaderFunctionArgs, redirect } from "react-router";
import { requireAuth } from "~/auth/auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAuth(request);
  return redirect("/play-history");
};
export default function Home() {
  return null;
}
