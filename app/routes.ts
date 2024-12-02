import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  route("/login", "auth/routes/auth.login.route.tsx"),
  route("/logout", "auth/routes/auth.logout.route.tsx"),
  layout("layout/root.layout.tsx", [index("routes/home.tsx")]),
  route("/auth/callback", "auth/routes/auth.callback.route.tsx"),
] satisfies RouteConfig;
