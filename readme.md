# Neuro In-Sight: Alzheimer's Disease Prediction Framework

Neuro In-Sight is a webased AI driven fromework currently for Alzhimers detection. It is designed for the automated detection and staging of Alzheimer's disease using brain MRI scans, combining high-performance backends with a scalable, user-friendly web interface. This repository demonstrates the architecture used for hosting the webpage on Render. Repositories for the development of the models are shown in the Appendex section. 

## Project Overview
The system aims to address the critical need for early screening and accurate diagnosis of neurological disorders. Before implementing this system we had performed a comparative analysis across multiple AI models. We had tested models developed from existing libraries (scikit-learn and pytorch), and models developed from the ground up. Afterwards the best models were deployed on the webpage. There are some limitations to the models when it comes to early detection and performing well amongst realistic population distributions. 

### Key Objectives
* **Model Evaluation**: Compare machine learning (Logistic Regression, Naive Bayes) and deep learning (CNN) architectures.
* **Practical Delivery**: Create an intuitive web interface for uploading MRIs and viewing understandable prediction results.
* **Generalizability**: Ensure model robustness by testing against independent datasets like ADNI and Kaggle.

## Technical Architecture & Code Reference
The system utilizes a concurrent development approach involving three primary programming languages to balance speed, reliability, and usability.

### 1. High-Performance Load Balancing (`main.cpp`)
The system entry point is a custom **C++ Load Balancer**. It manages traffic between multiple inference backends using:
* **Circuit Breaker Logic**: Detects backend failures and prevents system-wide timeouts by temporarily opening circuits.
* **Worker Thread Pool**: Uses a synchronized request queue and worker loops to handle concurrent image uploads efficiently.
* **Routing Strategy**: Tracks `active_requests` per backend instance (e.g., `service_CNN_1`, `service_CNN_2`) to implement a least-busy routing strategy.

### 2. Scalable Inference Backend (`app.py`)
The AI logic is served via **FastAPI** (Python), connecting the web interface with the trained models:
* **Neural Architecture**: Implements a `SimpleCNN` using PyTorch with sequential convolution, batch normalization, and max-pooling layers.
* **Dynamic Thresholding**: Generates a "threshold sweep" (from 0.1 to 0.9), allowing users to see how different sensitivity settings affect the diagnosis.
* **Preprocessing**: Standardizes incoming MRI data to $90 \times 90$ grayscale tensors before execution.

### 3. Frontend & Client Management (`script.js`)
The user interface handles orchestration and visualization:
* **Dynamic Environment Loading**: Fetches backend URLs at runtime through `loadEnvConfig()`, allowing the frontend to point to different service clusters without code changes.
* **Asynchronous Communication**: Uses the Fetch API to send images and model selections to the backend and dynamically updates the UI with results.
* **Visualization**: Renders probability progress bars and threshold charts to help practitioners weigh the AI's confidence level.

## Performance Results
* **Top Performance**: The Convolutional Neural Network (CNN) achieved the highest overall accuracy of **0.95** and an F1-score of **0.95**.
* **Traditional ML**: Logistic Regression optimized with Histogram of Oriented Gradients (HOG) achieved an accuracy of **0.88**.
* **Early Detection**: Models demonstrated the ability to differentiate Moderate and Mild cases but faced challenges with Very Mild Alzheimer's stages.

## Ethical Standards & Security
* **Data Privacy**: All patient data is de-identified, and images are not stored on the server to maintain privacy.
* **Standards Compliance**: Adheres to the NIST AI Risk Management Framework (RMF) and TEVV (Testing, Evaluation, Verification, Validation) protocols.
* **Medical Disclaimer**: The system includes a prominent disclaimer stating it is for demonstration purposes only and does not replace professional clinical diagnosis.

## Contributors
* **Basil Agboola** (Main Software Developer, and developer of Lava-Lamp Machine Learning Library)
* **Briann Briggs** (Main UX-UI Designer, and Research Assistant)
* **Tafari Dudley** (Project Manager, and Software Developer for python models)
* **Jafin Khan** (Main Research Lead, and Software Developer for python models)

*Department of Computer Science, Prairie View A&M University (May 2026)*

## Appendex (Recources)
Python ML Model Development Link: [CyberAID Python Models](https://github.com/tdudleyschool/Cyber_Aid_Python_Models)

Custome Rust Framework Link: [LavaLamp (Developed By Basil Agboola)](https://github.com/zeerkius/lavalamp)

## NOTE!!!

**MEDICAL DISCLAIMER** This system is for **demonstration and research purposes only**. The predictions generated by Neuro In-Sight are not medical diagnoses. This tool should not be used as a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of a physician or other qualified health provider with any questions you may have regarding a medical condition.