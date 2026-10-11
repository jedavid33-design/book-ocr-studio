// Build 256: source-faithful message bubble annotations.
// Styling lives outside OCR text. Nothing here edits the source manuscript.
(() => {
  "use strict";
  function paragraphs(text) {
    return String(text || "").replace(/\r/g, "").trim()
      .split(/\n{2,}/)
      .map(block => block.split("\n").map(line => line.trim()).filter(Boolean).join(" ").trim())
      .filter(Boolean);
  }
  function speakerLabel(value) {
    const text = String(value || "").trim();
    if (!/^[A-Z][A-Z .'-]{1,24}$/.test(text) || text.split(/\s+/).length > 2) return "";
    if (/^(CHAPTER|PROLOGUE|EPILOGUE|PART|THE END|THREE MONTHS LATER)$/i.test(text)) return "";
    return text;
  }
  function rows(text, saved = []) {
    const list = paragraphs(text);
    const counts = new Map();
    const annotations = Array.isArray(saved) ? saved : [];
    const used = new Set();
    const output = list.map((value, index) => {
      const occurrence = counts.get(value) || 0;
      counts.set(value, occurrence + 1);
      const candidates = annotations.map((annotation, id) => ({ annotation, id }))
        .filter(item => item.annotation?.text === value && item.annotation?.occurrence === occurrence);
      const item = candidates[0] || null;
      const label = index ? speakerLabel(list[index - 1]) : "";
      // A label may only be moved if that *same* printed label is still
      // adjacent. A changed label needs re-review; never make text disappear.
      const valid = item && (item.annotation.side === "outgoing" || item.annotation.side === "incoming")
        && (!item.annotation.label || item.annotation.label === label);
      if (valid) used.add(item.id);
      const flagged = Boolean(label && value.length <= 500)
        || (value.length <= 100 && /\b(?:lol|omg|idk|ur|u|wanna|gonna|txt|sext|brb)\b/i.test(value));
      return {
        text: value, index, occurrence,
        label, suggested: flagged,
        side: item && used.has(item.id) ? item.annotation.side : "",
        useLabel: Boolean(item && used.has(item.id) && item.annotation.label === label && label)
      };
    });
    const stale = annotations.filter((annotation, i) => !used.has(i));
    return {rows:output,stale,marked:output.filter(row => row.side).length,
      suggestions:output.filter(row => row.suggested && !row.side).length};
  }
  function setAnnotation(saved, row, side, useLabel = false) {
    const previous = Array.isArray(saved) ? saved : [];
    const next = previous.filter(item =>
      !(item?.text === row.text && item?.occurrence === row.occurrence));
    if (side !== "incoming" && side !== "outgoing") return next;
    next.push({text:row.text,occurrence:row.occurrence,side,
      label: useLabel && row.label ? row.label : ""});
    return next;
  }
  function labeledSuggestions(report, chapterPov) {
    const narrator = String(chapterPov || "").trim().toUpperCase();
    if (!narrator) return [];
    return (report?.rows || []).filter(row => row.suggested && row.label && !row.side)
      .map(row => ({row,side:row.label.toUpperCase() === narrator ? "outgoing" : "incoming"}));
  }
  function validate(page) {
    return rows(page?.text || "",page?.messageBubbles);
  }
  const api=Object.freeze({paragraphs,speakerLabel,rows,setAnnotation,validate,labeledSuggestions});
  if(typeof module !== "undefined" && module.exports)module.exports=api;
  if(typeof globalThis !== "undefined")globalThis.OcrMessageBubbles=api;
})();
