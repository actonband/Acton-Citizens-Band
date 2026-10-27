// Run only in the PR job: Firebase Hosting configuration applies to the channel being deployed.
import { readFile, writeFile } from "node:fs/promises";
const config = JSON.parse(await readFile("firebase.json", "utf8"));
config.hosting.headers.push({
  source: "**",
  headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
});
await writeFile("firebase.json", JSON.stringify(config, null, 2) + "\n");
