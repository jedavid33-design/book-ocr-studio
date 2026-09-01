(() => {
  "use strict";

  // Deliberately compact, local allowlist: a candidate is repaired only when the
  // complete joined token is a known word. Unknown names and specialist terms
  // remain unchanged instead of being guessed.
  const PLAUSIBLE_WORDS = new Set(`
affair affairs affect affected affecting affects affiliate affiliated affiliation
baffle baffled baffling baffles cliff cliffs coffee coffees cuff cuffs different
differently difficult difficulties effect effects effort efforts efficient efficiently
efficiency fifteen fifth fifty fiction field fields fierce fiercely fight fights fighting file
files filing fill filled filling fills film films filter filtered filtering filthy final finally
finals finance finances financial find finder finding finds fine finely finer finest
finger fingers fingertip fingertips finish finished finishes finishing fire fired fires
firing firm firmly firms first firstborn fish fishing fist fists fit fits fitted fitting fitness five fix fixed
fixated fixes fixing figure figured fixture fixtures flag flags flame flames flash flat flatter flattest flesh
flexible flight flights fling flip flipped flipping float floated floating floats flock
flood flooded flooding floor floors flow flowed flowing flows flower flowers flowering flushed
fluff fluffed fluffier fluffiest fluffy fly flies flying offer offered offering offers
office officer officers official officially raffle raffled raffles raffling staff staffs
stuff stuffed stuffing stuffs suffer suffered suffering suffers sufficient sufficiently
traffic waffle waffled waffles waffling
  `.trim().split(/\s+/));

  const CANDIDATE = /\b([A-Za-z]*(?:ffi|ffl|fi|fl|ff))[ \t]+([A-Za-z]+)\b/gi;

  function hasSafeCapitalization(joined) {
    return /^[a-z]+$/.test(joined) || /^[A-Z][a-z]+$/.test(joined);
  }

  function repairSplitLigatures(input) {
    let fixedCount = 0;
    let ambiguousCount = 0;
    const familyCounts = { fi: 0, fl: 0, ff: 0, ffi: 0, ffl: 0 };
    const text = String(input ?? "").replace(CANDIDATE, (original, left, right) => {
      const joined = left + right;
      const family = ["ffi", "ffl", "fi", "fl", "ff"].find(item => left.toLowerCase().endsWith(item));
      if (!hasSafeCapitalization(joined) || !PLAUSIBLE_WORDS.has(joined.toLowerCase())) {
        ambiguousCount += 1;
        return original;
      }
      fixedCount += 1;
      familyCounts[family] += 1;
      return joined;
    });
    return { text, fixedCount, ambiguousCount, familyCounts };
  }

  const api = Object.freeze({ repairSplitLigatures });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof globalThis !== "undefined") globalThis.BookOcrEpubPolish = api;
})();
