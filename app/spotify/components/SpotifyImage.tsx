import { Play } from "lucide-react";

interface SpotifyImage {
  src: string;
  alt: string;
  uri: string;
  // If the user has a premium account, they can play the track from the app,
  // otherwise we'll deep link to the Spotify app.
  canPlay: boolean;
}

export function SpotifyImage({ src, alt, uri }: SpotifyImage) {
  return (
    <div className="relative group">
      <img
        src={src}
        alt={alt}
        width={64}
        height={64}
        className="rounded-md aspect-square object-cover"
      />
      <a
        href={uri}
        className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity duration-200 rounded-md flex items-center justify-center text-white/80 hover:text-white"
      >
        <Play
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          size={24}
        />
      </a>
    </div>
  );
}
