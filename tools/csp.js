// Keeps the page's Content-Security-Policy in step with its own script.
//
// web/index.html allows only scripts from its own origin and its inline <script> by that script's SHA-256 hash
// (<meta http-equiv="Content-Security-Policy">, script-src). Any change to the script changes the hash, so after
// editing it run, from the repository root:
//   node tools/csp.js          writes the new hash into the page
//   node tools/csp.js --check  only checks (the web tests and the first CI step do this too; it can also be the
//                              site's build command on Cloudflare Pages, so a page with a wrong hash is never deployed)
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const PAGE = path.join(__dirname, "..", "web", "index.html");

/**
 * The base64 SHA-256 of every inline script (a <script> without src), exactly as the browser hashes it: the browser
 * reads CR LF and lone CR line ends as LF first, so a Windows checkout gives the same hash.
 */
function inlineHashes(html) {
  const out = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] && /\ssrc\s*=/.test(m[1])) continue;
    out.push("'sha256-" + crypto.createHash("sha256").update(m[2].replace(/\r\n?/g, "\n"), "utf8").digest("base64") + "'");
  }
  return out;
}

/** The page with script-src listing exactly its own inline scripts' hashes (and 'self'). */
function withHashes(html) {
  const meta = /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src )([^;"]*)/;
  if (!meta.test(html)) throw new Error("no Content-Security-Policy meta with script-src in web/index.html");
  return html.replace(meta, (all, head) => head + ["'self'"].concat(inlineHashes(html)).join(" "));
}

module.exports = { inlineHashes, withHashes, PAGE };

if (require.main === module) {
  const html = fs.readFileSync(PAGE, "utf8"), next = withHashes(html);
  if (process.argv.includes("--check")) {
    if (next !== html) { console.error("web/index.html: the script's hash in the Content-Security-Policy is out of date; run node tools/csp.js"); process.exit(1); }
    console.log("Content-Security-Policy up to date");
  } else {
    fs.writeFileSync(PAGE, next);
    console.log(next === html ? "Content-Security-Policy already up to date" : "Content-Security-Policy: script hash updated");
  }
}
