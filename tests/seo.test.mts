import test from "node:test";
import assert from "node:assert/strict";
import { bandStructuredData } from "../src/utils/site.ts";

test("band identity connects existing social profiles and the supplied Google listing", () => {
  const band = bandStructuredData()["@graph"][0];
  assert.equal(band["@type"], "MusicGroup");
  assert.equal(band.foundingDate, "1872");
  assert.ok(band.sameAs?.includes("https://maps.app.goo.gl/snw3w5NBsapRR3beA"));
  assert.ok(band.sameAs?.includes("https://www.facebook.com/ActonBand/"));
});
