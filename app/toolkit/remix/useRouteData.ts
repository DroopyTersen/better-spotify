import { UIMatch, useMatches } from "react-router";

type RouteSelector = <T>(route?: UIMatch<any>) => T;

export const useRouteData = (selector: RouteSelector) => {
  return selectRouteData(useMatches(), selector);
};

export const selectRouteData = (
  matches: ReturnType<typeof useMatches>,
  selector: RouteSelector
) => {
  let match = matches.reverse()?.find(selector);
  return selector(match);
};
