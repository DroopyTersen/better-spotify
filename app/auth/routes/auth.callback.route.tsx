import { LoaderFunctionArgs, redirect } from "react-router";
import { authenticator } from "~/auth/auth.server";
import { authSessionStorage } from "../authSession.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("🚀 | loader | request:", request.url);
  try {
    let user = await authenticator.authenticate("spotify", request);
    console.log("🚀 | loader | user:", user);
    let session = await authSessionStorage.getSession(
      request.headers.get("cookie")
    );
    session.set("user", user);

    return redirect("/", {
      headers: {
        "Set-Cookie": await authSessionStorage.commitSession(session),
      },
    });
  } catch (error) {
    console.error("🚀 | loader | error:", error);
    throw error;
  }
};
