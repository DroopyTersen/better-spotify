import { type ActionFunctionArgs, redirect } from "react-router";
import { authSessionStorage } from "../authSession.server";

export const loader = () => {
  throw new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const session = await authSessionStorage.getSession(
    request.headers.get("cookie")
  );
  return redirect("/login", {
    headers: { "Set-Cookie": await authSessionStorage.destroySession(session) },
  });
};
