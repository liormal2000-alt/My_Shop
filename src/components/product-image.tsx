"use client";
import { useState } from "react";
export default function ProductImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  // Local assets; native images keep deployment independent of an image service.
  return failed ? (
    <div className="image-fallback" role="img" aria-label={alt}>
      <span aria-hidden="true">☕</span>
      <small>{alt}</small>
    </div>
  ) : (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      width={600}
      height={450}
      onError={() => setFailed(true)}
    />
  );
}
