"""Book OCR Studio visual Italic classifier.

Offline trainer. Synthetic font pretraining and real-crop fine-tuning share the
same MobileNetV3-Small architecture. The Ruby v180 corpus should first be used
ONLY as an untouched transfer benchmark.
"""
from pathlib import Path
import argparse, json, random
import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.utils.data import Dataset, DataLoader
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
from torchvision.transforms import v2

class ManifestDataset(Dataset):
    def __init__(self, root, items, train=False):
        self.root=Path(root); self.items=items
        ops=[v2.ToImage(),v2.Resize((96,320),antialias=True)]
        if train:
            ops += [v2.RandomAffine(degrees=1.5,translate=(.015,.03),scale=(.96,1.04)),
                    v2.ColorJitter(brightness=.12,contrast=.15)]
        ops += [v2.ToDtype(torch.float32,scale=True),
                v2.Normalize(mean=(.485,.456,.406),std=(.229,.224,.225))]
        self.tf=v2.Compose(ops)
    def __len__(self): return len(self.items)
    def __getitem__(self,i):
        r=self.items[i]
        im=Image.open(self.root/r["file"]).convert("RGB")
        y=1.0 if r["label"]=="ITALIC" else 0.0
        return self.tf(im),torch.tensor(y,dtype=torch.float32),r.get("pageIndex",-1),r["file"]

def model(pretrained=True):
    weights=MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
    m=mobilenet_v3_small(weights=weights)
    m.classifier[-1]=nn.Linear(m.classifier[-1].in_features,1)
    return m

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("corpus")
    ap.add_argument("--epochs",type=int,default=8)
    ap.add_argument("--batch",type=int,default=32)
    ap.add_argument("--lr",type=float,default=2e-4)
    ap.add_argument("--seed",type=int,default=172)
    ap.add_argument("--out",default="italic-mobilenetv3.pt")
    ap.add_argument("--no-pretrained",action="store_true")
    a=ap.parse_args()
    random.seed(a.seed); np.random.seed(a.seed); torch.manual_seed(a.seed)
    root=Path(a.corpus)
    manifest=json.loads((root/"manifest.json").read_text())
    items=manifest["items"]
    ds=ManifestDataset(root,items,train=True)
    dl=DataLoader(ds,batch_size=a.batch,shuffle=True,num_workers=2)
    m=model(not a.no_pretrained)
    device="cuda" if torch.cuda.is_available() else "cpu"; m.to(device)
    pos=sum(r["label"]=="ITALIC" for r in items); neg=len(items)-pos
    lossfn=nn.BCEWithLogitsLoss(pos_weight=torch.tensor([neg/max(pos,1)],device=device))
    opt=torch.optim.AdamW(m.parameters(),lr=a.lr,weight_decay=1e-4)
    for epoch in range(a.epochs):
        m.train(); total=0.0
        for x,y,_,_ in dl:
            x=x.to(device); y=y.to(device)
            opt.zero_grad(); z=m(x).squeeze(1); loss=lossfn(z,y); loss.backward(); opt.step()
            total+=loss.item()*len(y)
        print(f"epoch {epoch+1}: loss={total/len(ds):.5f}")
    torch.save({"state_dict":m.state_dict(),"manifest_format":manifest.get("format"),
                "seed":a.seed},a.out)
    print("saved",a.out)

if __name__=="__main__": main()
