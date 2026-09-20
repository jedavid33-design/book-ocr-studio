"""Generate synthetic true Regular/Italic word-image pairs.

Usage:
  python generate_synthetic.py --fonts /path/to/fonts --out synthetic-data

Font discovery pairs files by family/style metadata from Pillow. Only genuine
font files whose style names indicate Regular/Roman and Italic are paired.
Oblique-only faces are excluded from the Italic class by default.

The generator deliberately renders the SAME token in both styles so lexical
identity cannot define the class.
"""
from pathlib import Path
import argparse, json, random, re
from PIL import Image, ImageDraw, ImageFont, ImageFilter

TOKENS = """about after again against almost always another around because before believe between
book called change chapter children could enough every family first found friend getting going great
guardians happen having house however inside little looked making might never nothing people perhaps
place really return returning right should something still story through together under until wanted
water where while without woman words world would young answer paper glanced suddenly already""".split()

def meta(path):
    try:
        f=ImageFont.truetype(str(path),48)
        fam,style=f.getname()
        return fam.strip(),style.strip()
    except Exception:
        return None

def discover(root):
    groups={}
    for p in Path(root).rglob("*"):
        if p.suffix.lower() not in (".ttf",".otf"): continue
        m=meta(p)
        if not m: continue
        fam,style=m; s=style.lower()
        kind=None
        if "italic" in s and "oblique" not in s: kind="italic"
        elif re.search(r"\b(regular|roman|book|normal)\b",s): kind="roman"
        if kind: groups.setdefault(fam,{})[kind]=p
    return [(fam,d["roman"],d["italic"]) for fam,d in groups.items() if "roman" in d and "italic" in d]

def render(text,font_path,rng):
    size=rng.randint(34,58)
    font=ImageFont.truetype(str(font_path),size)
    probe=Image.new("L",(1600,200),255); d=ImageDraw.Draw(probe)
    box=d.textbbox((0,0),text,font=font,stroke_width=0)
    w=max(8,box[2]-box[0]); h=max(8,box[3]-box[1])
    pad=rng.randint(5,13)
    bg=rng.randint(242,255); fg=rng.randint(0,45)
    im=Image.new("L",(w+pad*2,h+pad*2),bg); d=ImageDraw.Draw(im)
    d.text((pad-box[0],pad-box[1]),text,font=font,fill=fg)
    scale=rng.uniform(.82,1.22)
    im=im.resize((max(4,round(im.width*scale)),max(4,round(im.height*scale))),Image.Resampling.LANCZOS)
    if rng.random()<.35: im=im.filter(ImageFilter.GaussianBlur(rng.uniform(.15,.55)))
    if rng.random()<.5:
        # screenshot-like resample round trip
        s=rng.uniform(.72,.94); small=im.resize((max(4,round(im.width*s)),max(4,round(im.height*s))),Image.Resampling.LANCZOS)
        im=small.resize(im.size,Image.Resampling.LANCZOS)
    return Image.merge("RGB",(im,im,im))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--fonts",required=True)
    ap.add_argument("--out",required=True)
    ap.add_argument("--per-family",type=int,default=600)
    ap.add_argument("--seed",type=int,default=180)
    a=ap.parse_args(); rng=random.Random(a.seed)
    pairs=discover(a.fonts)
    if len(pairs)<8: raise SystemExit(f"Only {len(pairs)} genuine Regular/Italic families found; supply a broader open-font collection.")
    out=Path(a.out); (out/"roman").mkdir(parents=True,exist_ok=True); (out/"italic").mkdir(parents=True,exist_ok=True)
    manifest=[]; n=0
    for family,roman,italic in pairs:
        safe=re.sub(r"[^A-Za-z0-9._-]+","_",family)
        for j in range(a.per_family):
            token=rng.choice(TOKENS)
            for label,path in (("ROMAN",roman),("ITALIC",italic)):
                im=render(token,path,rng)
                rel=f"{label.lower()}/{safe}_{j:05d}_{token}.png"
                im.save(out/rel,optimize=True)
                manifest.append({"file":rel,"label":label,"text":token,"family":family,
                                 "styleFile":path.name,"pairIndex":j})
                n+=1
    data={"format":"book-ocr-studio-synthetic-italic-v1","seed":a.seed,
          "families":len(pairs),"count":n,"items":manifest}
    (out/"manifest.json").write_text(json.dumps(data,indent=2))
    print(f"generated {n} images from {len(pairs)} true Regular/Italic families")

if __name__=="__main__": main()
