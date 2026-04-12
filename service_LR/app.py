from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pickle
import cv2
import numpy as np
from skimage.feature import hog

app = FastAPI(title="MRI Classification API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Load model once at startup
# -----------------------------
MODEL_PATH = "logreg_pipeline_1.pkl"

try:
    with open(MODEL_PATH, "rb") as f:
        logreg_pipeline = pickle.load(f)
    print("Logistic Regression pipeline loaded successfully.")
except Exception as e:
    logreg_pipeline = None
    print(f"Error loading model: {e}")


# -----------------------------
# Helper function
# -----------------------------
def preprocess_image(image_bytes: bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)

    if img is None:
        raise ValueError("Invalid image file.")

    img = cv2.resize(img, logreg_pipeline["img_size"])
    img = img.astype(np.float32) / 255.0

    features = hog(img, **logreg_pipeline["hog_config"]).reshape(1, -1)
    features = logreg_pipeline["scaler"].transform(features)

    if logreg_pipeline["use_pca"]:
        features = logreg_pipeline["pca"].transform(features)

    return features


# -----------------------------
# Routes
# -----------------------------
@app.get("/")
def root():
    return {"message": "API is running."}


@app.get("/health")
def health():
    if logreg_pipeline is None:
        return {"status": "error", "message": "Model not loaded"}
    return {"status": "ok", "message": "Model loaded successfully"}


@app.post("/predict")
async def predict(
    file: UploadFile = File(...)
):
    if logreg_pipeline is None:
        raise HTTPException(status_code=500, detail="Model not loaded.")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    try:
        image_bytes = await file.read()
        features = preprocess_image(image_bytes)

        model = logreg_pipeline["model"]

        if not hasattr(model, "predict_proba"):
            raise HTTPException(
                status_code=500,
                detail="This model does not support probability prediction."
            )

        probs = model.predict_proba(features)[0]

        # Assuming class 1 = Malignant, class 0 = Benign
        malignant_prob = float(probs[1])

        pred = 1 if malignant_prob >= 0.5 else 0
        probability = malignant_prob if pred == 1 else float(probs[0])
        label = "Malignant" if pred == 1 else "Benign"

        return {
            "output": pred,
            "prediction": label,
            "probability": probability
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@app.post("/predict_threshold")
async def predict(
    file: UploadFile = File(...),
    threshold: float = Query(0.5, ge=0.0, le=1.0)
):
    if logreg_pipeline is None:
        raise HTTPException(status_code=500, detail="Model not loaded.")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    try:
        image_bytes = await file.read()
        features = preprocess_image(image_bytes)

        model = logreg_pipeline["model"]

        if not hasattr(model, "predict_proba"):
            raise HTTPException(
                status_code=500,
                detail="This model does not support probability prediction."
            )

        # --- probability ---
        probs = model.predict_proba(features)[0]
        malignant_prob = float(probs[1])
        benign_prob = float(probs[0])

        # --- single threshold prediction ---
        pred = int(malignant_prob >= threshold)
        label = "Malignant" if pred == 1 else "Benign"

        # --- threshold sweep ---
        thresholds = np.arange(0.1, 1.0, 0.1)

        sweep = []
        for t in thresholds:
            t = float(t)
            p = int(malignant_prob >= t)

            sweep.append({
                "threshold": t,
                "prediction": p,
                "label": "Malignant" if p == 1 else "Benign"
            })

        return {
            "output": pred,
            "prediction": label,
            "threshold": threshold,
            "threshold_sweep": sweep
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))