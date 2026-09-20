"""Ranking metrics for Book OCR Studio visual classifier predictions."""
import argparse, csv
from sklearn.metrics import average_precision_score, roc_auc_score

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("scores"); a=ap.parse_args()
    with open(a.scores,newline="") as f: rows=list(csv.DictReader(f))
    y=[int(r["label"] in ("1","ITALIC","italic","True")) for r in rows]
    s=[float(r["score"]) for r in rows]
    print("n",len(rows),"italics",sum(y))
    print("AP",average_precision_score(y,s))
    print("ROC_AUC",roc_auc_score(y,s))
    order=sorted(range(len(rows)),key=lambda i:s[i],reverse=True)
    for k in (25,50,100,250):
        top=order[:min(k,len(order))]; found=sum(y[i] for i in top)
        print(f"@{k}: italics={found} precision={found/len(top):.4f}")
if __name__=="__main__": main()
