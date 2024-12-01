import { useOutletContext } from "react-router";
import { User } from "./auth.server";

export const useCurrentUser = () => {
  let { currentUser } = useOutletContext<{ currentUser: User | null }>();
  return currentUser;
};
