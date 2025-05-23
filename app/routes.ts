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
    route("/songs", "routes/songs.route.tsx"),
    route("/artists", "routes/artists.route.tsx"),
    route("/artists/:artistId", "routes/artists.$artistId.route.tsx", [
      index("routes/artists.$artistId._index.route.tsx"),
      route("popular", "routes/artists.$artistId.popular.route.tsx"),
      route("albums", "routes/artists.$artistId.albums.route.tsx"),
    ]),
    route("/albums/:albumId", "routes/albums.$albumId.route.tsx"),
    route("/builder", "spotify/playlistBuilder/builder.route.tsx"),
    route("/playlist/:playlistId", "routes/playlist.$playlistId.route.tsx"),
    route("/play-history", "routes/play-history.route.tsx"),
    route("/search", "routes/search.route.tsx"),
  ]),
  route("/auth/callback", "auth/routes/auth.callback.route.tsx"),
  route("/spotify/sync", "spotify/sync/sync.route.tsx"),
  route(
    "api/build-playlist",
    "spotify/playlistBuilder/api.buildPlaylist.route.ts"
  ),
  route(
    "api/new-artist-recommendations",
    "spotify/playlistBuilder/api.new-artist-recommendations.route.ts"
  ),
  route(
    "api/modify-playlist",
    "spotify/playlistBuilder/api.modifyPlaylist.route.ts"
  ),
] satisfies RouteConfig;
