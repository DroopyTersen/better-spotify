import { ActionFunctionArgs, redirect } from "react-router";
import { authSessionStorage } from "../authSession.server";

export const loader = async ({ request }: ActionFunctionArgs) => {
  let session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  return redirect("/login", {
    headers: { "Set-Cookie": await authSessionStorage.destroySession(session) },
  });
};
