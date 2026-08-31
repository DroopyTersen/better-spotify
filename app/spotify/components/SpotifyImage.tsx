import { Play } from "lucide-react";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { createSpotifySdk } from "../createSpotifySdk";
import { cn } from "~/shadcn/lib/utils";
import type { CSSProperties } from "react";
import { playSpotifyItem } from "./playSpotifyItem";

interface SpotifyImage {
  src: string;
  alt: string;
  uri: string;
  // Size in pixels - defaults to 64 if not provided
  size?: number;
  className?: string;
}

export function SpotifyImage({
  src,
  alt,
  uri,
  size = 64,
  className,
}: SpotifyImage) {
  let currentUser = useCurrentUser();
  const imageStyle = {
    "--spotify-image-size": `${size}px`,
    "--spotify-image-mobile-size": `${Math.floor(size * 0.75)}px`,
  } as CSSProperties;

  const playItem =
    currentUser?.tokens
      ? async () => {
          const sdk = createSpotifySdk(currentUser.tokens);
          return playSpotifyItem({
            uri,
            player: sdk.player,
            openFallback: (fallbackUri) => window.location.assign(fallbackUri),
          });
        }
      : undefined;

  return (
    <div
      style={imageStyle}
      className="group relative size-[var(--spotify-image-mobile-size)] shrink-0 md:size-[var(--spotify-image-size)]"
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={cn("size-full rounded-md object-cover", className)}
      />
      <a
        href={uri}
        onClick={(e) => {
          if (playItem && uri?.startsWith("spotify:")) {
            e.preventDefault();
            void playItem();
          }
        }}
        aria-label={`Play ${alt}`}
        className="absolute inset-0 flex items-center justify-center rounded-md bg-black/20 text-white/80 transition-colors duration-200 hover:text-white md:bg-transparent group-hover:bg-black/50"
      >
        {uri?.startsWith("spotify:") ? (
          <Play
            className="opacity-80 md:opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            size={24}
          />
        ) : null}
      </a>
    </div>
  );
}
