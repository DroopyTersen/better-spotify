import { Play } from "lucide-react";
import { useCurrentUser } from "~/auth/useCurrentUser";
import { createSpotifySdk } from "../createSpotifySdk";
import { cn } from "~/shadcn/lib/utils";

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
  // Calculate responsive sizes based on the provided size
  const smallSize = Math.floor(size * 0.75); // 75% of original size for mobile
  const canPlay = currentUser?.product === "premium";

  const playItem =
    canPlay && currentUser?.tokens
      ? async () => {
          console.log("🚀 | uri:", uri);
          let contextUri = uri.includes("track") ? undefined : uri;
          let uris = uri.includes("track") ? [uri] : undefined;
          let sdk = createSpotifySdk(currentUser?.tokens);
          let devicesResult = await sdk.player.getAvailableDevices();
          console.log("🚀 | devices:", devicesResult);
          if (devicesResult.devices.length < 1) {
            return window.open(uri, "_blank");
          }
          let activeDevice =
            devicesResult.devices.find((d) => d.is_active) ||
            devicesResult.devices?.[0];
          console.log("🚀 | ? | activeDevice?.id:", {
            activeDevice,
            contextUri,
            uris,
          });
          await sdk.player.startResumePlayback(
            activeDevice?.id || "",
            contextUri,
            uris
          );
          return window.open(uri, "_blank");
        }
      : undefined;

  return (
    <div
      className={`relative group w-${smallSize}px h-${smallSize}px md:w-${size}px md:h-${size}px `}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={cn(
          `rounded-md aspect-square object-cover w-${smallSize}px h-${smallSize}px md:w-${size}px md:h-${size}px`,
          className
        )}
      />
      <a
        href={uri}
        onClick={(e) => {
          if (playItem) {
            e.preventDefault();
            playItem();
          }
        }}
        className="absolute inset-0 bg-black bg-opacity-20 md:bg-opacity-0 group-hover:bg-opacity-50 transition-opacity duration-200 rounded-md flex items-center justify-center text-white/80 hover:text-white"
      >
        <Play
          className="opacity-80 md:opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          size={24}
        />
      </a>
    </div>
  );
}
