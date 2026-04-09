# -*- coding: utf-8 -*-
"""
Load saved CNN model and test on ONE random malignant image
"""

import os
import random
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image

# -----------------------------
# Settings
# -----------------------------
IMG_SIZE = 90
SEED = 42

#random.seed(SEED)
torch.manual_seed(SEED)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("Using device:", device)

# -----------------------------
# Paths
# -----------------------------
MODEL_PATH = "service_CNN/cnn_model.pth"
TEST_MALIGNANT_DIR = "test/malignant"

# -----------------------------
# Transform
# -----------------------------
transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.5], std=[0.5])
])

# -----------------------------
# CNN Model (same architecture)
# -----------------------------
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

# -----------------------------
# Load model
# -----------------------------
model = SimpleCNN(IMG_SIZE).to(device)
model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
model.eval()
print("Model loaded successfully.")

# -----------------------------
# Pick RANDOM malignant image
# -----------------------------
image_files = [
    f for f in os.listdir(TEST_MALIGNANT_DIR)
    if f.lower().endswith(('.png', '.jpg', '.jpeg'))
]

if len(image_files) == 0:
    raise Exception("No images found in malignant test folder.")

random_image_name = random.choice(image_files)
image_path = os.path.join(TEST_MALIGNANT_DIR, random_image_name)

print(f"\nSelected image: {random_image_name}")

# -----------------------------
# Load + preprocess image
# -----------------------------
image = Image.open(image_path).convert('L')
image_tensor = transform(image).unsqueeze(0).to(device)

# -----------------------------
# Predict
# -----------------------------
with torch.no_grad():
    output = model(image_tensor)
    prob = torch.sigmoid(output).item()
    pred = 1 if prob > 0.5 else 0

label_str = "Malignant" if pred == 1 else "Benign"

print("\n=== Single Image Prediction ===")
print(f"Prediction : {label_str}")
print(f"Confidence : {prob:.4f}")