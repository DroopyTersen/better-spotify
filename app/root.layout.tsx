import { Outlet } from "react-router";
import { PlaylistSelectionProvider } from "~/playlistBuilder/PlaylistSelectionContext";

export default function RootLayout() {
  return (
    <PlaylistSelectionProvider>
      <Outlet />
    </PlaylistSelectionProvider>
  );
}
