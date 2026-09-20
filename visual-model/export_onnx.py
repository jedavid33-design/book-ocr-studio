"""Export trained MobileNetV3-Small to ONNX for ONNX Runtime Web."""
import argparse, torch
from torch import nn
from torchvision.models import mobilenet_v3_small

ap=argparse.ArgumentParser(); ap.add_argument("checkpoint"); ap.add_argument("--out",default="italic-mobilenetv3.onnx"); a=ap.parse_args()
m=mobilenet_v3_small(weights=None); m.classifier[-1]=nn.Linear(m.classifier[-1].in_features,1)
ck=torch.load(a.checkpoint,map_location="cpu"); m.load_state_dict(ck["state_dict"]); m.eval()
dummy=torch.randn(1,3,96,320)
torch.onnx.export(m,dummy,a.out,input_names=["image"],output_names=["italic_logit"],
                  dynamic_axes={"image":{0:"batch"},"italic_logit":{0:"batch"}},
                  opset_version=18)
print("saved",a.out)
