import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, jsonForHtml, metadata } from "../scripts/html.mjs";

test("untrusted event content cannot break out of JSON scripts or HTML attributes", () => {
  const attack = '</script><script>alert("x")</script>&';
  const json = jsonForHtml({ description: attack });
  assert.equal(json.includes("</script>"), false);
  assert.equal(JSON.parse(json).description, attack);
  assert.equal(escapeHtml('"<&'), "&quot;&lt;&amp;");
});

test("preview metadata disables indexing while keeping production canonical URLs", () => {
  const site = {
    url: "https://example.com",
    name: "Band",
    image: "/band.jpg",
    imageAlt: "Band photo",
    imageWidth: 1280,
    imageHeight: 640,
    imageType: "image/png",
  };
  const html = metadata({
    title: 'Concert "one"',
    description: "Music & community",
    url: site.url + "/",
    site,
    structuredData: { name: "Band" },
    noindex: true,
  });
  assert.match(html, /content="noindex,follow"/);
  assert.match(html, /rel="canonical" href="https:\/\/example.com\/"/);
  assert.match(html, /Concert &quot;one&quot;/);
  assert.match(html, /Music &amp; community/);
});
