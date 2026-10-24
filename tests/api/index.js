// Entry for `node --test tests/api`: Node 22 runs a directory argument as one file (this index.js), so it loads every
// *.test.mjs here. live-smoke.mjs (needs the internet) is not a *.test.mjs file and is run separately in CI.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

(async () => {
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith(".test.mjs")).sort();
  for (const f of files) await import(pathToFileURL(path.join(__dirname, f)).href);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
