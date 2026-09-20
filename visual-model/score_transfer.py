"""Score the trained visual Italic model on a labeled real-crop corpus."""
from pathlib import Path
import argparse, csv, json
import torch
from PIL import Image
from torch import nn
from torchvision.models import mobilenet_v3_small
from torchvision.transforms import v2
from sklearn.metrics import average_precision_score, roc_auc_score

ap=argparse.ArgumentParser()
ap.add_argument("corpus")
ap.add_argument("checkpoint")
ap.add_argument("--out",default="visual-transfer-scores.csv")
a=ap.parse_args()
root=Path(a.corpus)
items=json.loads((root/"manifest.json").read_text())["items"]

m=mobilenet_v3_small(weights=None)
m.classifier[-1]=nn.Linear(m.classifier[-1].in_features,1)
ck=torch.load(a.checkpoint,map_location="cpu",weights_only=False)
m.load_state_dict(ck["state_dict"]); m.eval()
tf=v2.Compose([v2.ToImage(),v2.Resize((96,320),antialias=True),
 v2.ToDtype(torch.float32,scale=True),
 v2.Normalize(mean=(.485,.456,.406),std=(.229,.224,.225))])

rows=[]
with torch.no_grad():
    for start in range(0,len(items),64):
        batch=items[start:start+64]
        x=torch.stack([tf(Image.open(root/r["file"]).convert("RGB")) for r in batch])
        scores=torch.sigmoid(m(x).squeeze(1)).tolist()
        rows.extend([{**r,"score":s} for r,s in zip(batch,scores)])

rows.sort(key=lambda r:r["score"],reverse=True)
y=[1 if r["label"]=="ITALIC" else 0 for r in rows]
s=[r["score"] for r in rows]
print("n",len(rows),"italics",sum(y))
print("AP",average_precision_score(y,s))
print("ROC_AUC",roc_auc_score(y,s))
for k in (25,50,100,250):
    top=rows[:min(k,len(rows))]
    found=sum(r["label"]=="ITALIC" for r in top)
    print(f"@{k}: italics={found} precision={found/len(top):.4f}")

fields=["file","label","text","pageIndex","lineIndex","wordIndex","score"]
with open(a.out,"w",newline="") as f:
    w=csv.DictWriter(f,fieldnames=fields); w.writeheader()
    for r in rows:w.writerow({k:r.get(k,"") for k in fields})
