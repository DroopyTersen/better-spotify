import { useMatches } from "react-router";
import type { User } from "./auth.server";

export const useCurrentUser = () => {
  const matches = useMatches();
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const data = matches[index]?.loaderData as
      | { currentUser?: User | null }
      | undefined;
    if (data?.currentUser) return data.currentUser;
  }
  return null;
};
