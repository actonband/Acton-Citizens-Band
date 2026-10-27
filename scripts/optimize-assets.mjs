import sharp from "sharp";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

const photoDirectory = "public/img/photos";
await mkdir("public/img/social", { recursive: true });
await mkdir("public/img/optimized", { recursive: true });
const logo = "public/img/branding/ACB-Logo-Red-Transparent.svg";
const brandMark = "public/img/branding/ACB-Brand-Mark-Red-Transparent.svg";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
await sharp(logo)
  .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile("public/img/branding/band-logo.png");
// Leave a small inset so the full logo has breathing room on a home screen.
await sharp(logo)
  .resize(160, 160, { fit: "contain", background: transparent })
  .extend({ top: 10, bottom: 10, left: 10, right: 10, background: transparent })
  .png()
  .toFile("public/img/branding/apple-touch-icon.png");
for (const size of [32, 48]) {
  await sharp(brandMark)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(`public/img/branding/favicon-${size}.png`);
}
// ACB-Social-Preview.png is maintained manually; never overwrite it here.
let originalBytes = 0;
for (const file of await readdir(photoDirectory)) {
  if (!/\.(jpe?g|png)$/i.test(file)) continue;
  const input = path.join(photoDirectory, file);
  originalBytes += (await stat(input)).size;
  const info = await sharp(input).metadata();
  const name = path.parse(file).name;
  for (const width of [480, 960, 1600]) {
    const options = { width, withoutEnlargement: true };
    for (const format of ["avif", "webp", file.toLowerCase().endsWith(".png") ? "png" : "jpg"]) {
      const output = `public/img/optimized/${name}-${width}.${format}`;
      const pipeline = sharp(input).resize(options);
      if (format === "avif") await pipeline.avif({ quality: 48, effort: 4 }).toFile(output);
      if (format === "webp") await pipeline.webp({ quality: 78 }).toFile(output);
      if (format === "jpg") await pipeline.jpeg({ quality: 80, mozjpeg: true }).toFile(output);
      if (format === "png")
        await pipeline.png({ palette: true, quality: 95, effort: 10 }).toFile(output);
    }
    if ((info.width || 0) <= width) break;
  }
}
console.log(
  `Original photos: ${(originalBytes / 1048576).toFixed(2)} MiB. Responsive AVIF/WebP/JPEG variants generated.`,
);
