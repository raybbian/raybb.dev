"use client";

import { Stream } from "@cloudflare/stream-react";

export function Video({
  id,
  title = "Video",
  autoplay = false,
  muted = false,
  loop = false,
  controls = true,
  poster,
  primaryColor,
  className = "",
}: {
  id: string;
  title?: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  poster?: string;
  primaryColor?: string;
  className?: string;
}) {
  return (
    <div
      className={`my-6 overflow-hidden rounded-xl border border-white/15 bg-black/20 shadow-lg shadow-black/10 ${className}`}
    >
      <Stream
        src={id}
        title={title}
        controls={controls}
        autoplay={autoplay}
        muted={muted}
        loop={loop}
        poster={poster}
        primaryColor={primaryColor}
        responsive
      />
    </div>
  );
}
