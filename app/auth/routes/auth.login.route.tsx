import {
  type ActionFunctionArgs,
  useNavigation,
  useSearchParams,
} from "react-router";
import {
  CircleAlert,
  Headphones,
  History,
  LoaderCircle,
  Music2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { beginSpotifyLogin } from "../spotifyAuth.server";
import { Card, CardContent } from "~/shadcn/components/ui/card";

const LOGIN_FEATURES = [
  {
    icon: History,
    title: "Rediscover favorites",
    description: "Bring forgotten music back into reach.",
  },
  {
    icon: Sparkles,
    title: "Build better playlists",
    description: "Shape mixes around your taste and intent.",
  },
  {
    icon: Headphones,
    title: "Explore your library",
    description: "Search and browse your listening in one place.",
  },
];

export const action = ({ request }: ActionFunctionArgs) =>
  beginSpotifyLogin(request);

export const meta = () => [
  { title: "Sign in · Better Spotify" },
  {
    name: "description",
    content: "Connect Spotify to explore your listening and build playlists.",
  },
];

export default function Login() {
  let navigation = useNavigation();
  let [searchParams] = useSearchParams();
  let isLoading = navigation.state !== "idle";
  const error = searchParams.get("error");
  const errorMessage =
    error === "session_expired"
      ? "Your Spotify session expired. Sign in again to continue."
      : error
        ? "Spotify sign-in did not complete. Nothing changed—please try again."
        : null;

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-[#080a09] px-5 py-6 text-white sm:px-8 sm:py-10">
      <div
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_16%_18%,rgba(29,185,84,0.2),transparent_34%),radial-gradient(circle_at_85%_75%,rgba(29,185,84,0.1),transparent_30%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:48px_48px]"
        aria-hidden="true"
      />

      <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
        <section className="order-2 max-w-2xl lg:order-1">
          <div className="mb-10 hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/80 shadow-sm backdrop-blur lg:inline-flex">
            <span className="grid size-7 place-items-center rounded-full bg-[#1DB954] text-black">
              <Music2 className="size-4" aria-hidden="true" />
            </span>
            Better Spotify
          </div>

          <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            Your music library, <span className="text-[#1ed760]">finally useful.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/60 sm:mt-6 sm:text-xl sm:leading-8">
            A personal music workspace for rediscovering favorites and building
            playlists from your saved music and listening history.
          </p>

          <div className="mt-7 grid divide-y divide-white/[0.08] border-y border-white/[0.08] sm:mt-10 sm:grid-cols-3 sm:gap-3 sm:divide-y-0 sm:border-y-0">
            {LOGIN_FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="grid grid-cols-[auto_1fr] gap-x-3 py-4 sm:block sm:rounded-2xl sm:border sm:border-white/[0.08] sm:bg-white/[0.035] sm:p-4 sm:backdrop-blur-sm"
              >
                <Icon
                  className="row-span-2 mt-0.5 size-5 text-[#1ed760] sm:mb-4 sm:mt-0"
                  aria-hidden="true"
                />
                <h2 className="text-sm font-semibold text-white/90">
                  {title}
                </h2>
                <p className="mt-1 text-xs leading-5 text-white/50 sm:mt-1.5">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <Card className="order-1 overflow-hidden rounded-[1.75rem] border-white/10 bg-[#111412]/90 text-white shadow-2xl shadow-black/40 backdrop-blur-xl lg:order-2">
          <CardContent className="p-6 sm:p-10">
            <div className="mb-7 flex items-center gap-3 text-sm font-medium text-white/80 lg:hidden">
              <span className="grid size-10 place-items-center rounded-xl border border-[#1DB954]/25 bg-[#1DB954]/10 text-[#1ed760]">
                <Music2 className="size-5" aria-hidden="true" />
              </span>
              Better Spotify
            </div>
            <div className="mb-8 hidden size-12 place-items-center rounded-2xl border border-[#1DB954]/25 bg-[#1DB954]/10 text-[#1ed760] lg:grid">
              <Music2 className="size-6" aria-hidden="true" />
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">Welcome back.</h2>
            <p className="mt-3 leading-7 text-white/60">
              Use Spotify to securely open your library and playlist tools.
            </p>

            {errorMessage && (
              <div
                className="mt-6 flex items-start gap-2.5 rounded-xl border border-red-400/20 bg-red-400/10 px-3.5 py-3 text-sm text-red-100"
                role="alert"
              >
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <p>{errorMessage}</p>
              </div>
            )}

            <form action="/login" method="post" className="mt-7">
              <button
                type="submit"
                disabled={isLoading}
                aria-busy={isLoading}
                className="flex w-full items-center justify-center rounded-full bg-[#1ed760] px-5 py-3.5 text-base font-semibold text-black transition duration-200 hover:bg-[#3be477] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1ed760] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111412] disabled:pointer-events-none disabled:opacity-60"
              >
                {isLoading ? (
                  <LoaderCircle
                    className="mr-3 size-5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <img src="/spotify-logo.svg" alt="" className="mr-2.5 size-6" />
                )}
                {isLoading ? "Connecting…" : "Log in with Spotify"}
              </button>
            </form>

            <div className="mt-6 flex items-start gap-2.5 border-t border-white/[0.08] pt-6 text-xs leading-5 text-white/60">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-[#1ed760]"
                aria-hidden="true"
              />
              <p>
                Spotify handles authentication. Your password stays with
                Spotify.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
