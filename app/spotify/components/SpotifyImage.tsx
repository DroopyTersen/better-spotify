import { Play } from "lucide-react";

interface SpotifyImage {
  src: string;
  alt: string;
  uri: string;
  // If the user has a premium account, they can play the track from the app,
  // otherwise we'll deep link to the Spotify app.
  canPlay: boolean;
  // Size in pixels - defaults to 64 if not provided
  size?: number;
}

export function SpotifyImage({ src, alt, uri, size = 64 }: SpotifyImage) {
  // Calculate responsive sizes based on the provided size
  const smallSize = Math.floor(size * 0.75); // 75% of original size for mobile

  return (
    <div
      className={`relative group w-${smallSize}px h-${smallSize}px md:w-${size}px md:h-${size}px`}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={`rounded-md aspect-square object-cover w-${smallSize}px h-${smallSize}px md:w-${size}px md:h-${size}px`}
      />
      <a
        href={uri}
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
