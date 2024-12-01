import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/login", "auth/routes/auth.login.route.tsx"),
  route("/logout", "auth/routes/auth.logout.route.tsx"),
  route("/auth/callback", "auth/routes/auth.callback.route.tsx"),
] satisfies RouteConfig;
