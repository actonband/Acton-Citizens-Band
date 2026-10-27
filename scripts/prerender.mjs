import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { metadata, escapeHtml } from "./html.mjs";

const require = createRequire(import.meta.url);
const { render, site, bandStructuredData } = require("../.render/render.cjs");
const preview = process.env.SITE_PREVIEW === "true";
const template = await readFile("build/index.html", "utf8");
const head = metadata({
  title: site.title,
  description: site.description,
  url: site.url + "/",
  site,
  structuredData: bandStructuredData(),
  noindex: preview,
});
const html = template
  .replace(/<title>[\s\S]*?<\/title>/, "")
  .replace(/<meta\s+name=(?:"description"|description)[^>]*>/, "")
  .replace("</head>", head + "</head>")
  .replace(/<div id=(?:"root"|root)><\/div>/, () => '<div id="root">' + render() + "</div>");
await writeFile("build/index.html", html);
await writeFile(
  "build/sitemap.xml",
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' +
    escapeHtml(site.url) +
    "/</loc></url>\n</urlset>\n",
);
await writeFile(
  "build/robots.txt",
  "User-agent: *\nDisallow:\n\nSitemap: " + site.url + "/sitemap.xml\n",
);
console.log(
  "Prerendered homepage; events load from Firestore in the browser." +
    (preview ? " Preview uses noindex." : ""),
);
