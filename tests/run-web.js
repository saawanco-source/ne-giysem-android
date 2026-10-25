// Runs every web test script in turn; each script exits with 1 when one of its checks fails.
const { spawnSync } = require("child_process");
const path = require("path");
const scripts = [
  "web/01-first-open.js", "web/02-remember-location.js", "web/03-search.js", "web/04-offline-manual.js",
  "web/05-races.js", "web/06-persistence.js", "web/07-pull-refresh.js", "web/09-api-mode.js", "web/10-people-wardrobe.js", "web/11-money.js", "web/08-weekly-packing-share.js", "web/12-english.js", "web/13-desktop-layout.js", "outfit/assert-findings.js"
];
let failed = [];
for (const s of scripts) {
  console.log("\n=== " + s);
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: "inherit", env: { ...process.env, TZ: process.env.TZ || "Europe/Istanbul" } });
  if (r.status !== 0) failed.push(s);
}
console.log(failed.length ? "\nBAŞARISIZ: " + failed.join(", ") : "\nTüm web testleri geçti.");
process.exit(failed.length ? 1 : 0);
