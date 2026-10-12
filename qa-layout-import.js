// Build 274: source-verified visual decisions in cumulative chapter QA.
// No inferred formatting. Failed anchors prevent the complete QA import.
(() => {
  "use strict";
  const TYPES = new Set(["message_bubble", "scene_break", "letter_block", "verified_paragraph_edit", "letter_line_break", "scene_rule", "chapter_dropcap", "typographic_ellipsis"]);
  const own = (v) => typeof v === "string" && v.length > 0;
  const compact = (v) => String(v || "").replace(/\r/g, "").split("\n")
    .map(x => x.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  function blocks(text) {
    const source = String(text || "");
    const result = [];
    let start = 0;
    const re = /\n[ \t]*\n/g;
    for (const m of source.matchAll(re)) {
      if (m.index > start && source.slice(start, m.index).trim())
        result.push({start, end:m.index, text:compact(source.slice(start, m.index))});
      start = m.index + m[0].length;
    }
    if (source.slice(start).trim()) result.push({start, end:source.length, text:compact(source.slice(start))});
    return result;
  }
  function decisions(chapters) {
    return (chapters || []).flatMap(ch => ch?.layout?.decisions || []);
  }
  function validateShape(chapters, pageCount) {
    const errors = [];
    const seen = new Set();
    const ranges = (chapters || []).map(ch => {
      const s = Number(String(ch?.chapter?.reviewedPageRange?.startPageId || "").match(/^p(\d+)$/)?.[1]);
      const e = Number(String(ch?.chapter?.reviewedPageRange?.endPageId || "").match(/^p(\d+)$/)?.[1]);
      return {s,e};
    });
    (chapters || []).forEach((chapter,ci) => {
      const layout = chapter?.layout;
      if (layout === undefined) return; // All existing Build 270 QA files stay compatible.
      if (!layout || !Array.isArray(layout.decisions)) {
        errors.push({code:"layout-array",message:"Chapter "+(ci+1)+": layout.decisions must be an array."});
        return;
      }
      for (const d of layout.decisions) {
        const id = String(d?.layoutId || "");
        const page = String(d?.pageId || "").match(/^p(\d+)$/);
        const pn = page ? Number(page[1]) : NaN;
        const fail = (code,message) => errors.push({code,message:(id||"layout?")+": "+message});
        if (!id || seen.has(id)) fail("layout-id","Missing or duplicate layoutId.");
        seen.add(id);
        if (!TYPES.has(d?.type)) fail("layout-type","Unsupported visual decision type.");
        if (d?.sourceVerified !== true) fail("layout-unverified","Only source-verified layout decisions may import.");
        if (!page || pn<1 || pn>pageCount || pn<ranges[ci].s || pn>ranges[ci].e)
          fail("layout-page","pageId is outside this chapter's reviewed pages.");
        if (d?.type==="message_bubble") {
          if (!own(d.paragraph) || !["incoming","outgoing"].includes(d.side))
            fail("layout-message","Message must have exact paragraph text and a reviewed incoming/outgoing side.");
          if (d.senderLabel!==undefined && (typeof d.senderLabel!=="string" || !d.senderLabel.trim()))
            fail("layout-sender","senderLabel must be a nonempty source label.");
          if (d.occurrence!==undefined && (!Number.isInteger(d.occurrence) || d.occurrence<0))
            fail("layout-occurrence","occurrence must be a nonnegative integer.");
        } else if (d?.type==="scene_break") {
          if (!own(d.before) || !own(d.after)) fail("layout-scene","Both adjacent paragraph anchors are required.");
        } else if (d?.type==="letter_block") {
          if (!own(d.startText) || !own(d.endText))
            fail("layout-letter","Both source-verified start and end phrases are required.");
        } else if (d?.type==="letter_line_break") {
          if (!own(d.paragraph) || !own(d.breakAfter)) fail("layout-letter-line","Complete letter paragraph and exact breakAfter are required.");
        } else if (d?.type==="scene_rule") {
          if (!own(d.before) || !own(d.after)) fail("layout-rule","Scene rule must have exact neighboring paragraphs.");
        } else if (d?.type==="typographic_ellipsis") {
          if (!own(d.paragraph) || !Number.isInteger(d.count) || d.count<1 || d.count>12)
            fail("layout-ellipsis","Ellipsis requires an exact page paragraph and a positive expected count.");
        } else if (d?.type==="chapter_dropcap") {
          if (!own(d.paragraph)) fail("layout-dropcap","Drop cap needs its exact opening paragraph.");
        } else if (d?.type==="verified_paragraph_edit") {
          if (!own(d.matchParagraph) || !own(d.finalParagraph) ||
              d.matchParagraph===d.finalParagraph || compact(d.matchParagraph).length<20)
            fail("layout-text","Verified edit needs distinct, exact full paragraphs of at least 20 characters.");
          const a=String(d.matchParagraph||""),b=String(d.finalParagraph||"");
          // Strictly reserve this escape hatch for tiny corrections to already
          // QA'd text. Large changes must go through the normal OCR item rules.
          if (Math.abs(a.length-b.length)>4 || a.length>2000 || b.length>2000)
            fail("layout-text-scope","Verified paragraph edit is not a minimal correction.");
        }
      }
    });
    return errors;
  }
  function locatePage(pages, d) {
    const idx = Number(String(d.pageId).slice(1))-1;
    if (!Number.isInteger(idx) || !pages[idx]) throw Error("Missing reviewed page "+d.pageId);
    return {page:pages[idx],idx};
  }
  function unique(list, description) {
    if (list.length !== 1) throw Error(description+" anchor matched "+list.length+" locations, expected exactly one");
    return list[0];
  }
  function exactIndex(source, phrase) {
    const positions = [];
    let pos=-1;
    while ((pos=source.indexOf(phrase,pos+1))>=0) positions.push(pos);
    return unique(positions,"Text");
  }
  function editVerifiedParagraph(page,d) {
    const source=String(page.text||""),list=blocks(source);
    const old=compact(d.matchParagraph),final=compact(d.finalParagraph);
    // No semantic replacement: only a short source-verified character edit.
    let i=0,j=0,edits=0;
    while(i<old.length && j<final.length) {
      if(old[i]===final[j]) {i++;j++;continue;}
      edits++;
      if(old[i+1]===final[j]) i++;
      else if(old[i]===final[j+1]) j++;
      else {i++;j++;}
      if(edits>4) throw Error("Verified edit exceeds four character changes");
    }
    edits+=(old.length-i)+(final.length-j);
    if(edits>4) throw Error("Verified paragraph edit is not minimally different");
    const oldMatches=list.filter(x=>x.text===old),newMatches=list.filter(x=>x.text===final);
    if(oldMatches.length===0 && newMatches.length===1) return false;
    const item=unique(oldMatches,"Verified paragraph");
    if(newMatches.length) throw Error("Corrected paragraph already appears elsewhere");
    // Protect all surrounding text and paragraph breaks.
    page.text=source.slice(0,item.start)+d.finalParagraph+source.slice(item.end);
    return true;
  }
  function markMessage(page, d, bubble) {
    if (!bubble?.rows || !bubble?.setAnnotation) throw Error("Message bubble renderer is unavailable");
    const report = bubble.rows(page.text || "", page.messageBubbles || []);
    if (report.stale.length) throw Error("Existing message marks have drifted");
    const matches = report.rows.filter(row => row.text === compact(d.paragraph));
    if (!matches.length) throw Error("Message paragraph does not match corrected OCR");
    const row = d.occurrence === undefined
      ? unique(matches,"Message paragraph")
      : matches.find(row => row.occurrence === d.occurrence);
    if (!row) throw Error("Message occurrence was not found");
    const sender = d.senderLabel || "";
    if (sender && row.label !== sender) throw Error("Printed sender label does not match corrected OCR");
    if (row.side && (row.side !== d.side || row.useLabel !== !!sender))
      throw Error("Message has a conflicting saved bubble decision");
    if (row.side) return false;
    page.messageBubbles = bubble.setAnnotation(page.messageBubbles || [],row,d.side,!!sender);
    const check = bubble.rows(page.text || "",page.messageBubbles).rows;
    if (!check.some(other => other.text === row.text && other.occurrence===row.occurrence
      && other.side===d.side && other.useLabel===!!sender))
      throw Error("Message annotation could not be verified after application");
    return true;
  }
  function markScene(page,d) {
    const list = blocks(page.text);
    const before = compact(d.before), after = compact(d.after);
    const candidates=[];
    for (let i=0;i<list.length;i++) {
      if (list[i].text!==before) continue;
      if (list[i+1]?.text===after) candidates.push({i,already:false});
      else if (list[i+1]?.text==="* * *" && list[i+2]?.text===after)
        candidates.push({i,already:true});
    }
    const match=unique(candidates,"Scene boundary");
    if (match.already) return false;
    const left=list[match.i],right=list[match.i+1],source=String(page.text);
    page.text=source.slice(0,left.end)+"\n\n* * *\n\n"+source.slice(right.start);
    return true;
  }
  function markLetter(page,d) {
    const source=String(page.text||""), start=exactIndex(source,d.startText), endStart=exactIndex(source,d.endText);
    const finish=endStart+d.endText.length;
    if (finish<=start) throw Error("Letter anchors out of order");
    const prefix=source.slice(0,start), suffix=source.slice(finish);
    // Start at a paragraph boundary or immediately after the narrator's colon.
    // An inline letter opening is common in flattened OCR; only a source-confirmed
    // colon may be separated, and the printed characters are preserved.
    if (prefix.trim() && !/(?:\n\s*\n\s*|:\s*)$/.test(prefix))
      throw Error("Letter start is not at an approved paragraph or colon boundary");
    if (suffix.trim() && !/^\s*\n\s*\n/.test(suffix))
      throw Error("Letter end is not at a paragraph boundary");
    const starts=(source.match(/\[\[letter\]\]/g)||[]).length;
    const ends=(source.match(/\[\[\/letter\]\]/g)||[]).length;
    if (starts||ends) {
      if (starts!==1 || ends!==1) throw Error("Unbalanced or multiple letter blocks");
      if (prefix.includes("[[letter]]") && suffix.includes("[[/letter]]")) return false;
      throw Error("Conflicting letter block already present");
    }
    page.text=prefix.trimEnd()+"\n\n[[letter]]\n\n"+source.slice(start,finish)+"\n\n[[/letter]]"+suffix;
    return true;
  }
  // Presentation approvals do not rewrite source prose. They are durable
  // per-page metadata, and the exporter verifies anchors again when rendering.
  function markPresentation(page,key,record) {
    const layout={...(page.layoutMeta||{})};
    const qa={...(layout.qaPresentation||{})};
    const current=Array.isArray(qa[key])?qa[key]:[];
    const id=key==="letterLines" ? record.paragraph
      : key==="dropcaps" || key==="ellipses" ? record.paragraph
      : record.before+"\\n"+record.after;
    const ident=item=>key==="letterLines" ? item.paragraph
      : key==="dropcaps" || key==="ellipses" ? item.paragraph
      : item.before+"\\n"+item.after;
    const other=current.find(item=>ident(item)===id);
    if(other) {
      if(JSON.stringify(other)===JSON.stringify(record))return false;
      throw Error("Conflicting existing source-verified presentation style");
    }
    qa[key]=[...current,record];
    page.layoutMeta={...layout,qaPresentation:qa};
    return true;
  }
  function markLetterLine(page,d) {
    const list=blocks(page.text);
    const phrase=compact(d.paragraph),breakAfter=String(d.breakAfter).trim();
    const target=unique(list.filter(x=>x.text===phrase),"Letter paragraph");
    const idx=String(page.text).indexOf("[[letter]]");
    const end=String(page.text).indexOf("[[/letter]]",idx+10);
    if(idx<0||end<=idx||target.start<=idx||target.end>=end)
      throw Error("Letter line must be inside an existing verified letter block");
    const at=phrase.indexOf(breakAfter);
    if(at<0 || phrase.indexOf(breakAfter,at+1)>=0 || !/\s/.test(phrase[at+breakAfter.length]||""))
      throw Error("Letter line break is missing or not between words");
    return markPresentation(page,"letterLines",{paragraph:phrase,breakAfter});
  }
  function markSceneRule(page,d) {
    const list=blocks(page.text);
    const before=compact(d.before),after=compact(d.after);
    unique(list.filter((row,i)=>row.text===before && list[i+1]?.text==="* * *"
      && list[i+2]?.text===after),"Horizontal scene rule");
    return markPresentation(page,"sceneRules",{before,after});
  }
  // A verified ellipsis is display metadata, never a global substitution.
  // OCR and Writer text remain original; EPUB output uses U+2026 only at
  // paragraphs that have screenshot-approved, exact, unique anchors.
  function markEllipsis(page,d) {
    const source=String(page.text||"");
    const phrase=compact(d.paragraph);
    const item=unique(blocks(source).filter(block=>block.text===phrase),"Ellipsis paragraph");
    const matches=(item.text.match(/\.\.\./g)||[]).length;
    if(matches!==d.count)throw Error("Ellipsis count changed from the approved screenshot");
    return markPresentation(page,"ellipses",{paragraph:phrase,count:d.count});
  }
  function markDropcap(page,d) {
    if(!page.chapterStart)throw Error("Drop cap is not on an approved chapter-opening page");
    const list=blocks(page.text),paragraph=compact(d.paragraph);
    const target=unique(list.filter(x=>x.text===paragraph),"Drop cap paragraph");
    const heading=String(page.chapterTitle||"").replace(/\n/g," ").replace(/\s+/g," ").trim();
    if(!heading||!list.slice(0,list.indexOf(target)).some(x=>x.text===String(page.chapterPov||"").trim()))
      throw Error("Drop cap paragraph is not after an approved chapter heading and POV");
    return markPresentation(page,"dropcaps",{paragraph});
  }

  function apply(pages,chapters,bubbleApi) {
    const records=decisions(chapters);
    const errors=[],changed=[];
    for (const d of records) {
      try {
        const {page,idx}=locatePage(pages,d);
        let yes=false;
        if (d.type==="verified_paragraph_edit") yes=editVerifiedParagraph(page,d);
        else if (d.type==="message_bubble") yes=markMessage(page,d,bubbleApi);
        else if (d.type==="scene_break") yes=markScene(page,d);
        else if (d.type==="letter_block") yes=markLetter(page,d);
        else if (d.type==="letter_line_break") yes=markLetterLine(page,d);
        else if (d.type==="scene_rule") yes=markSceneRule(page,d);
        else if (d.type==="chapter_dropcap") yes=markDropcap(page,d);
        else if (d.type==="typographic_ellipsis") yes=markEllipsis(page,d);
        else throw Error("Unsupported visual decision");
        if (yes) changed.push({layoutId:d.layoutId,pageIndex:idx});
      } catch (e) {
        errors.push({opId:d?.layoutId||"layout?",type:"visual_layout",pageId:d?.pageId,
          reason:String(e?.message||e)});
      }
    }
    return {requested:records.length,applied:changed.length,alreadyPresent:records.length-changed.length-errors.length,
      changed,errors};
  }
  const api=Object.freeze({validateShape,apply,blocks});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof globalThis!=="undefined")globalThis.OcrQaLayout=api;
})();
