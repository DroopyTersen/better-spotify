import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  route("/login", "auth/routes/auth.login.route.tsx"),
  route("/logout", "auth/routes/auth.logout.route.tsx"),
  layout("layout/root.layout.tsx", [
    index("routes/home.tsx"),
    route("/builder", "spotify/playlistBuilder/builder.route.tsx"),
    route("/playlist/:playlistId", "routes/playlist.$playlistId.route.tsx"),
  ]),
  route("/auth/callback", "auth/routes/auth.callback.route.tsx"),
  route("/spotify/sync", "spotify/sync/sync.route.tsx"),
  route(
    "api/buildPlaylist",
    "spotify/playlistBuilder/api.buildPlaylist.route.ts"
  ),
] satisfies RouteConfig;
