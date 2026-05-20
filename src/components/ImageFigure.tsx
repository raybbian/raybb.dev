import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";

// Static-image counterpart to <Figure>: same framing/caption styling, but for
// a baked screenshot rather than a live sketch.
export function ImageFigure({
  src,
  alt,
  caption,
  priority = false,
}: {
  src: StaticImageData | string;
  alt: string;
  caption?: ReactNode;
  priority?: boolean;
}) {
  return (
    <figure className="my-8">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/15 bg-black/20 shadow-lg shadow-black/10">
        <Image
          src={src}
          alt={alt}
          priority={priority}
          sizes="(min-width: 768px) 768px, 100vw"
          className="block h-auto w-full"
        />
      </div>
      {caption && (
        <figcaption className="ink-3 mt-2 text-center text-sm">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
