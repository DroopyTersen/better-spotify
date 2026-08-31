import { type UIMatch, useMatches } from "react-router";

type RouteData = Record<string, unknown>;
type RouteDataMatch = UIMatch<RouteData>;
type RouteSelector<Result> = (route?: RouteDataMatch) => Result;

export const useRouteData = <Result>(selector: RouteSelector<Result>): Result => {
  return selectRouteData(useMatches(), selector);
};

const selectRouteData = <Result>(
  matches: readonly UIMatch[],
  selector: RouteSelector<Result>
): Result => {
  const typedMatches = matches as readonly RouteDataMatch[];
  const match = [...typedMatches].reverse().find(selector);
  return selector(match);
};
