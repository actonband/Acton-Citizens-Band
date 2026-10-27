import type { ImgHTMLAttributes } from "react";

type Props = ImgHTMLAttributes<HTMLImageElement> & { src: string; width: number; height: number };

export default function ResponsiveImage({ src, width, height, fetchPriority, ...props }: Props) {
  const name = src.slice(src.lastIndexOf("/") + 1, src.lastIndexOf("."));
  const widths = [480, 960, 1600].filter((_, index, all) => index === 0 || width > all[index - 1]);
  const sourceSet = (format: string) =>
    widths
      .map((size) => `/img/optimized/${name}-${size}.${format} ${Math.min(size, width)}w`)
      .join(", ");
  const sizes = props.sizes || "(max-width: 720px) 100vw, 90vw";
  const fallback = src.toLowerCase().endsWith(".png") ? "png" : "jpg";
  return (
    <picture>
      <source type="image/avif" srcSet={sourceSet("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={sourceSet("webp")} sizes={sizes} />
      <img
        {...(fetchPriority ? { fetchpriority: fetchPriority } : {})}
        {...props}
        src={`/img/optimized/${name}-${widths[widths.length - 1]}.${fallback}`}
        srcSet={sourceSet(fallback)}
        sizes={sizes}
        width={width}
        height={height}
      />
    </picture>
  );
}
