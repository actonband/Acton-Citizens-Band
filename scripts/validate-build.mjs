import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
import path from "node:path";

const origin = "https://actoncitizensband.ca";
const sitemap = await readFile("build/sitemap.xml", "utf8");
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.equal(new Set(urls).size, urls.length, "Duplicate sitemap entries");
assert.deepEqual(urls, [origin + "/"], "Only the homepage belongs in the sitemap");
for (const url of urls) {
  const pathname = new URL(url).pathname;
  assert.ok(url.startsWith(origin + "/") && !url.includes("#"));
  const html = await readFile(path.join("build", pathname, "index.html"), "utf8");
  assert.equal((html.match(/<title>/g) || []).length, 1, `${url}: title count`);
  assert.equal((html.match(/name="description"/g) || []).length, 1, `${url}: description count`);
  assert.ok(html.includes(`rel="canonical" href="${url}"`), `${url}: canonical`);
  assert.match(html, /<h1[ >]/);
  assert.match(html, /og:image/);
  assert.match(html, /twitter:card/);
  assert.ok(
    html.includes(
      `content="${process.env.SITE_PREVIEW === "true" ? "noindex,follow" : "index,follow,max-image-preview:large"}"`,
    ),
  );
  assert.ok(!html.includes("band-page-data"), "No embedded event snapshots");
  assert.ok(!html.includes("/events/"), "No event-detail links");
  const schema = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(schema);
  assert.equal(JSON.parse(schema[1])["@graph"][0]["@type"], "MusicGroup");
  for (const match of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) {
    const target = path.join("build", match[1]);
    await access(target).catch(() => {
      throw new Error(`${url}: missing ${match[1]}`);
    });
  }
  for (const match of html.matchAll(/srcset="([^"]+)"/gi)) {
    for (const candidate of match[1].split(","))
      await access(path.join("build", candidate.trim().split(" ")[0]));
  }
}
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(filename);
    else
      assert.ok(
        !/(?:AGENTS\.md|\.map|\.tsx?|\.env.*|webpack.*|package.*|render\.cjs)$/.test(entry.name),
        `Private/source file in output: ${filename}`,
      );
  }
}
await inspect("build");
await access("build/404.html");
assert.ok(!(await readdir("build")).includes("events"), "No generated event pages");
console.log(
  `Validated ${urls.length} canonical HTML pages, JSON-LD and local asset links; no source/private files found.`,
);
