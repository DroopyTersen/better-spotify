import { Play } from "lucide-react";

interface SpotifyImage {
  src: string;
  alt: string;
  item_id: string;
  item_type: "track" | "artist";
}

export function SpotifyImage({ src, alt }: SpotifyImage) {
  return (
    <div className="relative group">
      <img
        src={src}
        alt={alt}
        width={64}
        height={64}
        className="rounded-md aspect-square object-cover"
      />
      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity duration-200 rounded-md flex items-center justify-center">
        <Play
          className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          size={24}
        />
      </div>
    </div>
  );
}
