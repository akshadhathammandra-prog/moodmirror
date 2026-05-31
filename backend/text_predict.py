from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import numpy as np
import re
from textblob import TextBlob

model_path = "models/text_model"

model = None
tokenizer = None

def load_text_models_if_needed():
    global model, tokenizer
    if model is not None and tokenizer is not None:
        return True
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_path, use_fast=False)
        model = AutoModelForSequenceClassification.from_pretrained(model_path)
        model.eval()
        return True
    except Exception as e:
        print(f"Failed to load text model: {e}")
        return False

def clean_text(text):
    text = str(text).lower()
    text = re.sub(r"[^a-zA-Z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def predict_text_depression(text):
    if not load_text_models_if_needed():
        return {"score": 0, "severity": "Backend Error (Text Model not loaded)"}
        
    text = clean_text(text)

    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=256
    )

    with torch.no_grad():
        outputs = model(**inputs)

        pred = torch.sigmoid(
            outputs.logits.squeeze()
        ).item()

    score = pred * 24

    sentiment = TextBlob(text).sentiment.polarity

    adjustment = (0 - sentiment) * 6

    final_score = score + adjustment

    final_score = max(0, min(24, final_score))

    if final_score < 5:
        severity = "Minimal"
    elif final_score < 10:
        severity = "Mild"
    elif final_score < 15:
        severity = "Moderate"
    elif final_score < 20:
        severity = "Moderately Severe"
    else:
        severity = "Severe"

    return {
        "score": round(final_score, 2),
        "severity": severity
    }