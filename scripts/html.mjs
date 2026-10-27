export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

export function jsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function metadata({ title, description, url, site, structuredData, noindex = false }) {
  const esc = escapeHtml;
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="${noindex ? "noindex,follow" : "index,follow,max-image-preview:large"}" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(site.name)}" />
<meta property="og:locale" content="en_CA" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:image" content="${site.url}${site.image}" />
<meta property="og:image:width" content="${site.imageWidth}" />
<meta property="og:image:height" content="${site.imageHeight}" />
<meta property="og:image:type" content="${esc(site.imageType)}" />
<meta property="og:image:alt" content="${esc(site.imageAlt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${site.url}${site.image}" />
<meta name="twitter:image:alt" content="${esc(site.imageAlt)}" />
${structuredData ? `<script type="application/ld+json">${jsonForHtml(structuredData)}</script>` : ""}`;
}
