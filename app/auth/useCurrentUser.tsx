import { useOutletContext } from "react-router";
import { User } from "./auth.server";
import { useRouteData } from "~/toolkit/remix/useRouteData";

export const useCurrentUser = () => {
  let currentUser = useRouteData((route) => route?.data?.currentUser) as
    | User
    | undefined;
  return currentUser || null;
};
