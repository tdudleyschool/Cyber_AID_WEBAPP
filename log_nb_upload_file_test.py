# -*- coding: utf-8 -*-
"""
Test a single random malignant image using the saved Logistic Regression pipeline
"""

import os
import random
import pickle
import cv2
import numpy as np
from skimage.feature import hog

# -----------------------------
# Settings
# -----------------------------
SEED = 42
random.seed(SEED)
np.random.seed(SEED)

# -----------------------------
# Paths
# -----------------------------
MODEL_PATH = "service_LR/logreg_pipeline.pkl"
TEST_MALIGNANT_DIR = "test/malignant"

# -----------------------------
# Load pipeline
# -----------------------------
with open(MODEL_PATH, "rb") as f:
    logreg_pipeline = pickle.load(f)
print("Logistic Regression pipeline loaded successfully.")

# -----------------------------
# Pick random image
# -----------------------------
image_files = [
    f for f in os.listdir(TEST_MALIGNANT_DIR)
    if f.lower().endswith(('.png', '.jpg', '.jpeg'))
]

if not image_files:
    raise Exception("No images found in the malignant test folder.")

random_image_name = random.choice(image_files)
image_path = os.path.join(TEST_MALIGNANT_DIR, random_image_name)
print(f"\nSelected image: {random_image_name}")

# -----------------------------
# Load + preprocess image
# -----------------------------
img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
img = cv2.resize(img, logreg_pipeline["img_size"])
img = img.astype(np.float32) / 255.0
features = hog(img, **logreg_pipeline["hog_config"]).reshape(1, -1)

# Apply scaler
features = logreg_pipeline["scaler"].transform(features)

# Apply PCA if used
if logreg_pipeline["use_pca"]:
    features = logreg_pipeline["pca"].transform(features)

# -----------------------------
# Predict
# -----------------------------
pred = logreg_pipeline["model"].predict(features)[0]
label_str = "Malignant" if pred == 1 else "Benign"

print("\n=== Single Image Prediction ===")
print(f"Prediction : {label_str}")