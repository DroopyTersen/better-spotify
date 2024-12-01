import { ActionFunctionArgs } from "react-router";
import { authenticator } from "../auth.server";

export const action = ({ request }: ActionFunctionArgs) => {
  return authenticator.authenticate("spotify", request);
};

export default function Login() {
  return (
    <form action="/login" method="post">
      <button>Login with Spotify</button>
    </form>
  );
}
