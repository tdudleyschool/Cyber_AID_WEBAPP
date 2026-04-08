from fastapi import FastAPI, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import numpy as np
import pickle
import joblib
import cv2

app = FastAPI(title="Alzheimer MRI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models
with open("logreg_model.pkl", "rb") as f:
    logreg = pickle.load(f)

with open("naive_bayes_model.pkl", "rb") as f:
    nb = pickle.load(f)

scaler = joblib.load("scaler.pkl")
pca = joblib.load("pca.pkl")

# Hardcoded metrics
METRICS = {
    "logreg": {
        "accuracy": 0.84,
        "sensitivity": 0.84,
        "f1": 0.84
    },
    "nb": {
        "accuracy": 0.79,
        "sensitivity": 0.81,
        "f1": 0.80
    }
}


@app.get("/")
def home():
    return {"message": "API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/app")
def serve_frontend():
    return FileResponse("cyberaid.html")


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    model: str = Query(...)
):
    contents = await file.read()
    np_img = np.frombuffer(contents, np.uint8)

    img = cv2.imdecode(np_img, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return {"error": "Could not decode image."}

    img = cv2.resize(img, (60, 60))
    img = img.astype(np.float32) / 255.0

    flattened_img = img.flatten().reshape(1, -1)

    X = scaler.transform(flattened_img)
    X = pca.transform(X)

    if model == "logreg":
        prediction = int(logreg.predict(X)[0])
    elif model == "nb":
        prediction = int(nb.predict(X)[0])
    else:
        return {"error": "Invalid model selection."}

    metrics = METRICS[model]

    return {
        "prediction": prediction,
        "accuracy": metrics["accuracy"],
        "sensitivity": metrics["sensitivity"],
        "f1": metrics["f1"]
    }