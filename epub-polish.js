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


  function listSplitLigatureCandidates(input) {
    const text = String(input ?? "");
    const re = new RegExp(CANDIDATE.source, CANDIDATE.flags);
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      const original = m[0], left = m[1], right = m[2];
      const joined = left + right;
      const family = ["ffi", "ffl", "fi", "fl", "ff"].find(item => left.toLowerCase().endsWith(item)) || "";
      const plausibleJoin = PLAUSIBLE_WORDS.has(joined.toLowerCase());

      // Evidence-first review: ordinary word boundaries such as
      // "off the", "off doing", or "off personal" are not ligature damage
      // merely because the left word ends in ff/fi/fl.
      //
      // Plausible, safely-capitalized joins are repaired automatically by
      // repairSplitLigatures(). The review list is reserved for the rare
      // plausible join blocked only by capitalization.
      if (plausibleJoin && !hasSafeCapitalization(joined)) {
        out.push({ original, left, right, joined, family, index: m.index });
      }

      if (m[0].length === 0) re.lastIndex++;
    }
    return out;
  }

  const SCENE_MARKER = /^(?:\*{3,}|[-–—]{3,}|[•·◆◇❖✦⁂❦☙❧]+|[①②③④⑤⑥⑦⑧⑨⑩]+)$/u;

  function normalizeEllipses(input) {
    let fixedCount = 0;
    const text = String(input ?? "").replace(/(?:…|\.(?:[ \t]*\.){2,})/g, (match) => {
      const normalized = "…";
      if (match !== normalized) fixedCount += 1;
      return normalized;
    });
    return { text, fixedCount };
  }

  function normalizeSceneMarkers(input) {
    let fixedCount = 0;
    const blocks = String(input ?? "").split(/(\n{2,})/);
    const text = blocks.map(block => {
      const trimmed = block.trim();
      if (trimmed && SCENE_MARKER.test(trimmed)) {
        if (trimmed !== "* * *") fixedCount += 1;
        return "* * *";
      }
      return block;
    }).join("");
    return { text, fixedCount };
  }


  function repairObviousDialogueClosers(input) {
    let fixedCount = 0;
    const blocks = String(input ?? "").split(/(\n{2,})/);
    const text = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed || !trimmed.startsWith('"')) return block;
      const quoteCount = (trimmed.match(/"/g) || []).length;
      if (quoteCount % 2 !== 1 || !/[.!?]'$/.test(trimmed)) return block;
      const repaired = trimmed.replace(/([.!?])'$/, '$1"');
      if (repaired === trimmed) return block;
      fixedCount += 1;
      const leading = block.match(/^\s*/)?.[0] || "";
      const trailing = block.match(/\s*$/)?.[0] || "";
      return leading + repaired + trailing;
    }).join("");
    return { text, fixedCount };
  }



  // Patterns learned from full-book visual QA. These are deliberately limited
  // to punctuation/quote/contraction shapes that are unambiguous without
  // guessing the author's prose.
  function repairQaSafePatterns(input) {
    let text = String(input ?? "");
    const counts = {
      strayQuoteApostrophes: 0, quoteSpaces: 0, droppedPronounI: 0,
      digitLContractions: 0, openingQuoteSpaces: 0, missingPostQuoteSpaces: 0,
      openingQuoteBoundaryShifts: 0
    };

    // Paddle sometimes reads a closing double quote as apostrophe + double
    // quote:  okay.'"  ->  okay."  This shape cannot be a valid contraction.
    text = text.replace(/([.!?…])['’](["”])/g, (m, punct, quote) => {
      counts.strayQuoteApostrophes += 1;
      return punct + quote;
    });

    // A source-visible closing quote is sometimes separated from its terminal
    // punctuation by OCR whitespace:  okay. "  ->  okay."
    // Only collapse the space when the quote behaves like a CLOSING quote
    // (followed by whitespace/end/punctuation). Without this lookahead, valid
    // sentence + opening-dialogue boundaries such as `Isaiah laughs. "Range`
    // were being corrupted into `Isaiah laughs." Range`.
    text = text.replace(/([.!?…])(?:[ \t]+)(["”])(?=\s|$|[,;:!?])/g, (m, punct, quote) => {
      counts.quoteSpaces += 1;
      return punct + quote;
    });

    // OCR sometimes leaves a space immediately after a paragraph-opening quote.
    text = text.replace(/(^|\n\s*\n)(["“])[ \t]+(?=\S)/gm, (m, boundary, quote) => {
      counts.openingQuoteSpaces += 1;
      return boundary + quote;
    });

    // Closing dialogue quote glued to the following capitalized narration.
    // Require terminal punctuation immediately before the quote so paragraph-
    // opening quotes are never mistaken for closers.
    text = text.replace(/([.!?…]["”])(?=[A-Z])/g, (m, closer) => {
      counts.missingPostQuoteSpaces += 1;
      return closer + " ";
    });


    // Opening-quote boundary shifts are deliberately REVIEW-ONLY in v2.7.54.
    // A pattern such as `Isaiah laughs." Range...` is suspicious, but prose
    // styles vary enough that Studio should surface it in Final Polish instead
    // of silently moving quotation marks. `openingQuoteBoundaryShifts` therefore
    // remains zero here and is counted only by the audit/review path.

    // Common Paddle confusion: lowercase l becomes digit 1 inside I'll/it'll/etc.
    text = text.replace(/\b([A-Za-z]+)'1l\b/g, (m, stem) => {
      counts.digitLContractions += 1;
      return `${stem}'ll`;
    });

    // Paddle repeatedly drops the capital I from contractions. Restrict the
    // automatic repair to paragraph starts or immediately after an opening
    // dialogue quote, where 'm/'ll/'d/'ve cannot stand alone grammatically.
    text = text.replace(/(^|\n\s*\n)(["“]?)[‘’'](m|ll|d|ve)\b/gim, (m, boundary, quote, tail) => {
      counts.droppedPronounI += 1;
      return `${boundary}${quote}I'${tail}`;
    });
    text = text.replace(/(["“])[‘’'](m|ll|d|ve)\b/gi, (m, quote, tail) => {
      counts.droppedPronounI += 1;
      return `${quote}I'${tail}`;
    });

    return {
      text, ...counts,
      fixedCount: counts.strayQuoteApostrophes + counts.quoteSpaces + counts.droppedPronounI +
        counts.digitLContractions + counts.openingQuoteSpaces + counts.missingPostQuoteSpaces +
        counts.openingQuoteBoundaryShifts
    };
  }

  function safePolishText(input) {
    const ellipsis = normalizeEllipses(input);
    const scenes = normalizeSceneMarkers(ellipsis.text);
    const quotes = repairObviousDialogueClosers(scenes.text);
    const qa = repairQaSafePatterns(quotes.text);
    return {
      text: qa.text,
      fixedCount: ellipsis.fixedCount + scenes.fixedCount + quotes.fixedCount + qa.fixedCount,
      ellipsisCount: ellipsis.fixedCount,
      sceneCount: scenes.fixedCount,
      quoteCount: quotes.fixedCount,
      strayQuoteApostrophes: qa.strayQuoteApostrophes,
      quoteSpaces: qa.quoteSpaces,
      droppedPronounI: qa.droppedPronounI,
      digitLContractions: qa.digitLContractions,
      openingQuoteSpaces: qa.openingQuoteSpaces,
      missingPostQuoteSpaces: qa.missingPostQuoteSpaces,
      openingQuoteBoundaryShifts: qa.openingQuoteBoundaryShifts,
    };
  }


  function finalPolishText(input) {
    // Final Polish must audit the same post-repair text that Repair Book uses.
    // Re-run the idempotent QA-safe normalizations here before building review
    // cards so a repaired opening quote cannot reappear as a stale quote-balance
    // warning (for example: Isaiah laughs.\" Range -> Isaiah laughs. \"Range).
    const qa = repairQaSafePatterns(String(input ?? ""));
    let text = qa.text;
    const counts = { punctuationSpacing: 0, quoteSpacing: 0, dashSpacing: 0 };

    // Remove spaces that OCR sometimes inserts immediately before closing punctuation.
    text = text.replace(/[ \t]+([,;:!?])/g, (m, punct) => {
      counts.punctuationSpacing += 1;
      return punct;
    });

    // Remove a space between a closing quote and punctuation: word" , -> word",
    text = text.replace(/["”][ \t]+([,;:!?])/g, (m, punct) => {
      counts.quoteSpacing += 1;
      return m[0] + punct;
    });

    // Normalize whitespace around em dashes only when an em dash already exists.
    text = text.replace(/[ \t]*—[ \t]*/g, (m) => {
      if (m === "—") return m;
      counts.dashSpacing += 1;
      return "—";
    });

    return {
      text,
      fixedCount: (qa.fixedCount || 0) + counts.punctuationSpacing + counts.quoteSpacing + counts.dashSpacing,
      qaSafeCount: qa.fixedCount || 0,
      openingQuoteBoundaryShifts: qa.openingQuoteBoundaryShifts || 0,
      ...counts,
    };
  }

  const api = Object.freeze({ repairSplitLigatures, listSplitLigatureCandidates, normalizeEllipses, normalizeSceneMarkers, repairObviousDialogueClosers, repairQaSafePatterns, safePolishText, finalPolishText });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof globalThis !== "undefined") globalThis.BookOcrEpubPolish = api;
})();
