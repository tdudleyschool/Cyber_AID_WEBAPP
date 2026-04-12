#
# CNN Service for backend of Web Application
#

import os
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image
from io import BytesIO
import numpy as np


from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware


# ========================= Settings =========================

IMG_SIZE = 90
MODEL_PATH = "cnn_model_1.pth"
INSTANCE_NAME = os.getenv("SERVICE_INSTANCE", "cnn-service")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("Using device:", device)

# ========================= Transform =========================

transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.5], std=[0.5])
])

# ========================= CNN Model =========================

class SimpleCNN(nn.Module):
    def __init__(self, img_size):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1), nn.BatchNorm2d(16), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(16, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.MaxPool2d(2),
        )

        with torch.no_grad():
            dummy = torch.zeros(1, 1, img_size, img_size)
            dummy = self.conv(dummy)
            self.flatten_dim = dummy.view(1, -1).shape[1]

        self.fc = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(self.flatten_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 1)
        )

    def forward(self, x):
        x = self.conv(x)
        return self.fc(x)

# ========================= Load Model =========================

model = SimpleCNN(IMG_SIZE).to(device)
model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
model.eval()

print("Model loaded successfully.")

# ========================= FastAPI Setup =========================

app = FastAPI(title="CNN Model API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========================= Routes =========================

@app.get("/")
def home():
    return {"message": "CNN API is running"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict")
async def predict(request: Request, file: UploadFile = File(...)):
    request_id = request.headers.get("x-request-id")

    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded.")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    try:
        contents = await file.read()
        image = Image.open(BytesIO(contents)).convert("L")

        image_tensor = transform(image).unsqueeze(0).to(device)

        with torch.no_grad():
            output = model(image_tensor)
            prob = torch.sigmoid(output).item()

        pred = 1 if prob >= 0.5 else 0
        probability = prob if pred == 1 else (1 - prob)
        label = "Malignant" if pred == 1 else "Benign"

        return {
            "output": pred,
            "prediction": label,
            "probability": probability,
            "request_id": request_id,
            "instance": INSTANCE_NAME
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@app.post("/predict_threshold")
async def predict_threshold(
    request: Request,
    file: UploadFile = File(...),
    threshold: float = Query(0.5, ge=0.0, le=1.0)
):
    request_id = request.headers.get("x-request-id")

    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded.")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    try:
        contents = await file.read()
        image = Image.open(BytesIO(contents)).convert("L")

        image_tensor = transform(image).unsqueeze(0).to(device)

        with torch.no_grad():
            output = model(image_tensor)
            prob = torch.sigmoid(output).item()

        # --- single threshold prediction ---
        pred = int(prob >= threshold)
        label = "Malignant" if pred == 1 else "Benign"

        # --- threshold sweep ---
        thresholds = np.arange(0.1, 1.0, 0.1)

        sweep = []
        for t in thresholds:
            t = float(t)
            p = int(prob >= t)

            sweep.append({
                "threshold": t,
                "prediction": p,
                "label": "Malignant" if p == 1 else "Benign"
            })

        return {
            "output": pred,
            "prediction": label,
            "threshold": threshold,
            "threshold_sweep": sweep,
            "request_id": request_id,
            "instance": INSTANCE_NAME
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")