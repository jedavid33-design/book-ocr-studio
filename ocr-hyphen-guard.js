// Build 268: seven source-verified compound hyphens from Pucked Over QA.
// Deliberately exact. Only a printed line-ending hyphen with this complete
// left/right boundary can be protected; no missing hyphen is invented.
(() => {
  "use strict";
  const VERIFIED_COMPOUNDS = new Set([
    "twelve-year-old", "sweat-soaked", "almost-changing",
    "post-camping", "speed-walk", "high-pitched",
    "up-close-and-personal"
  ]);

  function shouldPreserveHyphen(left, right) {
    const before = String(left ?? "");
    const after = String(right ?? "");
    const tail = /(?:^|\s)([A-Za-z]+(?:-[A-Za-z]+)*)-$/.exec(before);
    const head = /^([a-z]+(?:-[a-z]+)*)\b/.exec(after);
    if (!tail || !head) return false;
    return VERIFIED_COMPOUNDS.has((tail[1] + "-" + head[1]).toLowerCase());
  }

  const api = Object.freeze({ shouldPreserveHyphen });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof globalThis !== "undefined") globalThis.OcrHyphenGuard = api;
})();
