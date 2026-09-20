"""Export trained MobileNetV3-Small as one self-contained ONNX file for ONNX Runtime Web."""
import argparse, os, torch
from torch import nn
from torchvision.models import mobilenet_v3_small

ap=argparse.ArgumentParser()
ap.add_argument("checkpoint")
ap.add_argument("--out",default="italic-mobilenetv3.onnx")
a=ap.parse_args()

m=mobilenet_v3_small(weights=None)
m.classifier[-1]=nn.Linear(m.classifier[-1].in_features,1)
ck=torch.load(a.checkpoint,map_location="cpu",weights_only=False)
m.load_state_dict(ck["state_dict"])
m.eval()
dummy=torch.randn(1,3,96,320)

# dynamo=False uses the mature exporter and keeps this small model's weights
# inside the .onnx file instead of producing a browser-breaking .onnx.data sidecar.
torch.onnx.export(
    m,dummy,a.out,
    input_names=["image"],output_names=["italic_logit"],
    dynamic_axes={"image":{0:"batch"},"italic_logit":{0:"batch"}},
    opset_version=18,
    dynamo=False,
    external_data=False,
)

sidecar=a.out+".data"
if os.path.exists(sidecar):
    raise RuntimeError(f"Unexpected external-data sidecar created: {sidecar}")
if os.path.getsize(a.out) < 1_000_000:
    raise RuntimeError(f"ONNX unexpectedly small ({os.path.getsize(a.out)} bytes); weights may be external")
print("saved self-contained",a.out,os.path.getsize(a.out),"bytes")
