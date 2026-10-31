// The page under its own Content-Security-Policy in the tests (used by tests/web/lib.js and tests/outfit/harness.js).
//
// web/index.html carries its real policy (<meta http-equiv="Content-Security-Policy">), so a request it doesn't allow
// fails in the tests as it would on the site. Only what the tests themselves need is added, for the tests only:
//   - the fake app server (https://api.test) and Open-Meteo, which "direct" mode uses (the live page never does)
//   - the AdSense script, which the ad tests switch on with a test publisher ID; the live page has AdSense off, and
//     tests/web/11-money.js checks that the live policy lists AdSense exactly when CONFIG.adsense is filled in.
const fs = require("fs"), path = require("path");
const { withHashes } = require(path.join(__dirname, "..", "..", "tools", "csp.js"));

const TEST_CONNECT = ["https://api.test", "https://api.open-meteo.com", "https://geocoding-api.open-meteo.com"];
const TEST_SCRIPT = ["https://pagead2.googlesyndication.com"];

/** Throws when the script's hash in the page's policy doesn't match the script (the page wouldn't run at all). */
function checkHash(appDir) {
  const html = fs.readFileSync(path.join(appDir, "index.html"), "utf8");
  if (withHashes(html) !== html) throw new Error("web/index.html: the script's hash in the Content-Security-Policy is out of date; run node tools/csp.js");
}

/** A file's body as the tests serve it: index.html with the test-only additions to its policy. */
function pageBody(file) {
  const body = fs.readFileSync(file);
  if (path.basename(file) !== "index.html") return body;
  return body.toString("utf8").replace(/(Content-Security-Policy" content="[^"]*)/, (m) => m
    .replace(/(connect-src [^;"]*)/, (c) => c + " " + TEST_CONNECT.join(" "))
    .replace(/(script-src [^;"]*)/, (c) => c + " " + TEST_SCRIPT.join(" ")));
}

module.exports = { checkHash, pageBody };
