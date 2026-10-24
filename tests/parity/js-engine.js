// Loads the web app's engine (plan, liveInput, dayPlan) out of index.html into a Node function with a controllable state S.
const fs = require("fs");
function load(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error("marker " + a); return html.slice(i, j); };
  const helpers = cut("  /* ================= helpers ================= */", "  function kindOf(c, day){");
  const engine = cut("  var G = {tshirt", "  /* ================= render ================= */");
  const src = '"use strict";\nvar S;\n' + helpers + "\n" + engine + "\n" +
    "return {setS:function(s){S=s;}, plan:plan, liveInput:liveInput, dayPlan:dayPlan};";
  return new Function(src)();
}
module.exports = { load };
