==================================================
FILE: backend/app.py
===========================

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import bcrypt
import jwt
from functools import wraps
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

from db import get_db, get_collection
from text_predict import predict_text_depression
from audio_predict import predict_audio_depression
from tasks import send_forgot_password_email, send_password_reset_email

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
USERS_FILE = "users.json"
app.config["SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "fallback-secret-key")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Migration logic for local users.json -> MongoDB
def migrate_legacy_users():
    users_col = get_collection("users")
    if users_col is None:
        return
        
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r") as f:
                users = json.load(f)
                
            migrated_count = 0
            for email, data in users.items():
                if not users_col.find_one({"email": email}):
                    users_col.insert_one({
                        "email": email,
                        "password": data.get("password"),
                        "created_at": datetime.now(timezone.utc)
                    })
                    migrated_count += 1
            if migrated_count > 0:
                print(f"Migrated {migrated_count} users to MongoDB.")
        except Exception as e:
            print(f"Failed to migrate legacy users: {e}")

# Run migration on startup
with app.app_context():
    migrate_legacy_users()

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
        
        if not token:
            return jsonify({"error": "Token is missing"}), 401
            
        try:
            data = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
            # Pass the email forward using request object
            request.user_email = data["email"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
            
        return f(*args, **kwargs)
    return decorated

@app.route("/signup", methods=["POST"])
def signup():
    data = request.json
    email = data.get("email")
    password = data.get("password")
    name = data.get("name", email.split('@')[0])
    
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
        
    users_col = get_collection("users")
    if users_col is None:
        return jsonify({"error": "Database unavailable"}), 503
        
    if users_col.find_one({"email": email}):
        return jsonify({"error": "User already exists"}), 409
        
    hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    users_col.insert_one({
        "email": email,
        "name": name,
        "password": hashed_password,
        "created_at": datetime.now(timezone.utc)
    })
    
    return jsonify({"message": "User created successfully"}), 201

@app.route("/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    password = data.get("password")
    
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
        
    users_col = get_collection("users")
    if users_col is None:
        return jsonify({"error": "Database unavailable"}), 503
        
    user = users_col.find_one({"email": email})
    
    if not user or not bcrypt.checkpw(password.encode("utf-8"), user["password"].encode("utf-8")):
        return jsonify({"error": "Invalid email or password"}), 401
        
    token = jwt.encode(
        {"email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=30)},
        app.config["SECRET_KEY"],
        algorithm="HS256"
    )
    
    return jsonify({"token": token, "email": email, "name": user.get("name", email.split("@")[0])}), 200

@app.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.json
    email = data.get("email")
    
    if not email:
        return jsonify({"error": "Email is required"}), 400
        
    try:
        reset_token = jwt.encode(
            {"email": email, "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            app.config["SECRET_KEY"],
            algorithm="HS256"
        )
        send_forgot_password_email.delay(email, reset_token)
        return jsonify({"message": "If an account exists, a reset link will be sent shortly."}), 202
    except Exception as e:
        return jsonify({"error": "Failed to queue task. Background worker might be down."}), 503

@app.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.json
    token = data.get("token")
    new_password = data.get("new_password")
    
    if not token or not new_password:
        return jsonify({"error": "Token and new password are required"}), 400
        
    try:
        payload = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
        email = payload["email"]
    except Exception:
        return jsonify({"error": "Invalid or expired token"}), 401
        
    users_col = get_collection("users")
    if users_col is None:
        return jsonify({"error": "Database unavailable"}), 503
        
    user = users_col.find_one({"email": email})
    if user:
        hashed_password = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        users_col.update_one({"email": email}, {"$set": {"password": hashed_password}})
        
        try:
            send_password_reset_email.delay(email)
        except Exception:
            pass
            
        return jsonify({"message": "Password reset successfully"}), 200
    
    return jsonify({"error": "User not found"}), 404

# --- New MongoDB API Endpoints ---

@app.route("/api/user/profile", methods=["GET", "POST"])
@token_required
def user_profile():
    users_col = get_collection("users")
    if users_col is None:
        return jsonify({"error": "Database unavailable"}), 503
        
    if request.method == "GET":
        user = users_col.find_one({"email": request.user_email}, {"_id": 0, "password": 0})
        return jsonify(user or {})
        
    if request.method == "POST":
        data = request.json
        update_data = {k: v for k, v in data.items() if k in ["name", "theme"]}
        users_col.update_one({"email": request.user_email}, {"$set": update_data})
        return jsonify({"message": "Profile updated"})

@app.route("/api/notifications", methods=["GET", "POST"])
@token_required
def notifications():
    users_col = get_collection("users")
    if users_col is None:
        return jsonify({"error": "Database unavailable"}), 503
        
    if request.method == "GET":
        user = users_col.find_one({"email": request.user_email})
        return jsonify(user.get("read_notifications", []) if user else [])
        
    if request.method == "POST":
        data = request.json
        read_ids = data.get("read_notifications", [])
        users_col.update_one({"email": request.user_email}, {"$set": {"read_notifications": read_ids}})
        return jsonify({"message": "Notifications updated"})

@app.route("/api/moods", methods=["GET", "POST"])
@token_required
def moods():
    moods_col = get_collection("moods")
    if moods_col is None:
        return jsonify({"error": "Database unavailable"}), 503
        
    if request.method == "GET":
        user_moods = moods_col.find_one({"email": request.user_email}, {"_id": 0})
        return jsonify(user_moods.get("entries", {}) if user_moods else {})
        
    if request.method == "POST":
        entries = request.json
        moods_col.update_one(
            {"email": request.user_email},
            {"$set": {"entries": entries}},
            upsert=True
        )
        return jsonify({"message": "Moods saved"}), 201

@app.route("/api/history", methods=["GET"])
@token_required
def history():
    predictions_col = get_collection("predictions")
    if predictions_col is None:
        return jsonify({"error": "Database unavailable"}), 503
        
    preds = list(predictions_col.find({"user_email": request.user_email}, {"_id": 0}))
    preds.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return jsonify(preds)

# --- Update Predictions to Save to MongoDB ---

@app.route("/predict-text", methods=["POST"])
@token_required
def predict_text():
    data = request.json
    text = data.get("text", "")
    
    result = predict_text_depression(text)
    
    # Save to MongoDB
    predictions_col = get_collection("predictions")
    if predictions_col is not None:
        entry = {
            "user_email": request.user_email,
            "type": "text",
            "content": text,
            "score": result.get("score"),
            "severity": result.get("severity"),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        predictions_col.insert_one(entry)
        result["timestamp"] = entry["timestamp"]
        
    return jsonify(result)

@app.route("/predict-audio", methods=["POST"])
@token_required
def predict_audio():
    if "audio" not in request.files:
        return jsonify({"error": "No audio uploaded"})
        
    file = request.files["audio"]
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)
    
    result = predict_audio_depression(filepath)
    
    # Extract optional metadata
    audio_id = request.form.get("audioId")
    duration = request.form.get("duration")
    file_name = request.form.get("fileName")
    
    # Save to MongoDB
    predictions_col = get_collection("predictions")
    if predictions_col is not None:
        entry = {
            "user_email": request.user_email,
            "type": "audio",
            "score": result.get("score"),
            "severity": result.get("severity"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "audioId": audio_id,
            "duration": duration,
            "fileName": file_name
        }
        predictions_col.insert_one(entry)
        result["timestamp"] = entry["timestamp"]
        
    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=False)

==================================================
FILE: backend/audio_predict.py
===========================

import os
import logging
import torch
import torch.nn as nn
import librosa
import numpy as np
import subprocess
import imageio_ffmpeg

from transformers import Wav2Vec2Processor, Wav2Vec2Model, Wav2Vec2Config
from safetensors.torch import load_file

# ============================================
# LOGGING SETUP
# ============================================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================
# DEVICE
# ============================================
device = "cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"Using device for audio prediction: {device}")

# ============================================
# MODEL DEFINITION
# ============================================
class Wav2Vec2Regression(nn.Module):
    def __init__(self):
        super().__init__()
        # MUST load pretrained weights to get the frozen CNN feature extractor weights
        self.wav2vec = Wav2Vec2Model.from_pretrained("facebook/wav2vec2-base")
        self.dropout = nn.Dropout(0.3)
        self.regressor = nn.Linear(self.wav2vec.config.hidden_size, 1)

    def forward(self, input_values):
        outputs = self.wav2vec(input_values)
        hidden_states = outputs.last_hidden_state
        pooled = torch.mean(hidden_states, dim=1)
        pooled = self.dropout(pooled)
        prediction = self.regressor(pooled)
        return prediction.squeeze(-1)

# ============================================
# MODEL INITIALIZATION (SINGLETON)
# ============================================
model_path = "models/audio_model"
model = None
processor = None

def load_models_if_needed():
    global model, processor
    if model is not None and processor is not None:
        return True
        
    try:
        logger.info("Initializing Wav2Vec2 Processor...")
        processor = Wav2Vec2Processor.from_pretrained("facebook/wav2vec2-base")
        
        logger.info("Initializing Wav2Vec2Regression Model Architecture...")
        global_model = Wav2Vec2Regression()
        
        logger.info("Loading safetensors weights into model...")
        state_dict = load_file(f"{model_path}/model.safetensors")
        global_model.load_state_dict(state_dict, strict=False)
        
        global_model.to(device)
        global_model.eval()
        model = global_model
        logger.info("Audio Model successfully loaded into memory.")
        return True
    except Exception as e:
        logger.error(f"Failed to load audio model: {e}")
        return False

# ============================================
# ROBUST FFMPEG AUDIO LOADER
# ============================================
def load_audio_robust(filepath):
    """Decodes ANY audio format (including WebM from browsers) to 16kHz mono float32 without requiring system ffmpeg."""
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    command = [
        ffmpeg_exe,
        '-i', filepath,
        '-f', 'f32le',
        '-acodec', 'pcm_f32le',
        '-ac', '1',
        '-ar', '16000',
        '-'
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = process.communicate()
    
    if process.returncode != 0:
        raise RuntimeError(f"FFMPEG audio decoding failed: {stderr.decode()}")
        
    audio = np.frombuffer(stdout, dtype=np.float32)
    return audio, 16000

# ============================================
# PREDICTION LOGIC
# ============================================
def predict_audio_depression(audio_path):
    if not load_models_if_needed():
        return {"score": 0, "severity": "Backend Error (Model not loaded)"}

    if not os.path.exists(audio_path):
        logger.error(f"Audio file not found at path: {audio_path}")
        return {"score": 0, "severity": "Error: File not found"}

    try:
        logger.info(f"Loading and decoding audio file securely: {audio_path}")
        
        # Robustly load audio using ffmpeg bypassing librosa's dependency on system packages
        signal, sr = load_audio_robust(audio_path)
        
        if signal is None or len(signal) == 0:
            logger.warning("Audio signal is completely empty after decoding.")
            return {"score": 0, "severity": "Error: Empty audio"}
            
        if np.isnan(signal).any():
            logger.warning("Audio signal contains NaNs.")
            return {"score": 0, "severity": "Error: Corrupted audio"}

        # Silence trimming
        signal, _ = librosa.effects.trim(signal, top_db=20)

        # Length validation
        if len(signal) < 16000:
            logger.warning("Audio is too short after trimming silence (< 1 sec). Returning safe default.")
            return {"score": 2.0, "severity": "Minimal"}

        # Normalize audio amplitude
        signal = librosa.util.normalize(signal)

        # Prepare inputs for the model
        inputs = processor(
            signal,
            sampling_rate=16000,
            return_tensors="pt",
            padding=True
        )
        input_values = inputs.input_values.to(device)

        logger.info("Running neural network inference...")
        with torch.inference_mode():
            pred = model(input_values).item()
            
        logger.info(f"Raw neural network output: {pred:.4f}")

        if 0.0 <= pred <= 1.0:
            final_score = pred * 24.0
        else:
            final_score = pred

        final_score = max(0.0, min(24.0, final_score))
        logger.info(f"Final mapped score (0-24): {final_score:.2f}")

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

        # ============================================
        # MULTI-MODAL TEXT INTEGRATION
        # ============================================
        import speech_recognition as speech_recog
        from text_predict import predict_text_depression
        
        text_score = 0
        transcribed_text = ""
        try:
            recognizer = speech_recog.Recognizer()
            # Convert float32 signal to int16 for speech recognition
            audio_int16 = (signal * 32767).astype(np.int16)
            audio_data = speech_recog.AudioData(audio_int16.tobytes(), sr, 2)
            transcribed_text = recognizer.recognize_google(audio_data)
            logger.info(f"Transcribed audio: {transcribed_text}")
            
            text_result = predict_text_depression(transcribed_text)
            text_score = text_result.get("score", 0)
            logger.info(f"Text model score: {text_score}")
        except Exception as e:
            logger.warning(f"Speech recognition failed or returned empty: {e}")

        # Mix acoustic and text predictions securely by taking the worst-case (max) score
        blended_score = max(final_score, text_score)
        
        # ============================================
        # CORRECTLY MIXED HANDCRAFTED HEURISTICS
        # ============================================
        # If the ML models regress to the mean, we correctly apply a clinical semantic heuristic.
        # This solves the issue of the models ignoring severe explicit text markers.
        if transcribed_text:
            severe_keywords = ['hopeless', 'suicide', 'kill', 'exhausting', 'lost interest', 'impossible', 'dead', 'worthless', 'nothing']
            if any(keyword in transcribed_text.lower() for keyword in severe_keywords):
                blended_score += 8.0
                
        blended_score = min(24.0, blended_score)
        
        if blended_score < 5:
            final_severity = "Minimal"
        elif blended_score < 10:
            final_severity = "Mild"
        elif blended_score < 15:
            final_severity = "Moderate"
        elif blended_score < 20:
            final_severity = "Moderately Severe"
        else:
            final_severity = "Severe"

        return {
            "score": round(blended_score, 2),
            "severity": final_severity
        }

    except Exception as e:
        logger.exception(f"Unhandled exception during audio prediction: {e}")
        return {
            "score": 0,
            "severity": "Processing Error"
        }

==================================================
FILE: backend/text_predict.py
===========================

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

==================================================
FILE: backend/db.py
===========================

import os
import logging
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatabaseManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
            cls._instance._init_db()
        return cls._instance

    def _init_db(self):
        self.client = None
        self.db = None
        self.connected = False
        
        uri = os.getenv("MONGODB_URI")
        db_name = os.getenv("MONGODB_DATABASE", "moodmirror")
        
        if not uri:
            logger.warning("MONGODB_URI not found in environment. Database connection will not be established.")
            return
            
        try:
            # Set a short timeout for initial connection to avoid long blocking
            self.client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            # The ismaster command is cheap and does not require auth.
            self.client.admin.command('ismaster')
            self.db = self.client[db_name]
            self.connected = True
            logger.info("Successfully connected to MongoDB.")
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            self.client = None
            self.db = None
            self.connected = False

    def get_db(self):
        # Attempt to reconnect if not connected
        if not self.connected:
            logger.info("Attempting to reconnect to MongoDB...")
            self._init_db()
        return self.db
        
    def get_collection(self, collection_name):
        db = self.get_db()
        if db is not None:
            return db[collection_name]
        return None

# Export a singleton instance
db_manager = DatabaseManager()

def get_db():
    return db_manager.get_db()

def get_collection(name):
    return db_manager.get_collection(name)

==================================================
FILE: backend/tasks.py
===========================

import time
import logging
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from celery_worker import celery_app

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

def send_real_email(to_email, subject, body):
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.error("SMTP_USER or SMTP_PASSWORD not set in environment variables")
        raise ValueError("SMTP credentials missing")
        
    msg = MIMEMultipart()
    msg['From'] = SMTP_USER
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))
    
    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)


@celery_app.task(bind=True, max_retries=3)
def send_forgot_password_email(self, email, reset_token=None):
    """
    Simulates sending a forgot password email asynchronously.
    """
    logger.info(f"Preparing to send 'Forgot Password' email to {email}")
    try:
        subject = "MoodMirror - Password Reset Request"
        
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5174")
        reset_link = f"{frontend_url}/reset-password?token={reset_token}" if reset_token else f"{frontend_url}/reset-password"
        logger.info(f"Generated reset_link: {reset_link}")
        
        body = f"Hello,\n\nYou have requested to reset your password for MoodMirror.\n\nPlease follow this link to reset it:\n{reset_link}\n\nBest,\nMoodMirror Team"
        send_real_email(email, subject, body)
        logger.info(f"Successfully sent 'Forgot Password' email to {email}")
        return {"status": "success", "email": email, "type": "forgot_password"}
    except Exception as exc:
        logger.error(f"Failed to send email to {email}. Retrying...")
        raise self.retry(exc=exc, countdown=5)

@celery_app.task(bind=True, max_retries=3)
def send_password_reset_email(self, email):
    """
    Simulates sending a password reset confirmation email asynchronously.
    """
    logger.info(f"Preparing to send 'Password Reset' email to {email}")
    try:
        subject = "MoodMirror - Password Reset Successful"
        body = f"Hello,\n\nYour password for MoodMirror has been successfully reset.\n\nBest,\nMoodMirror Team"
        send_real_email(email, subject, body)
        logger.info(f"Successfully sent 'Password Reset' email to {email}")
        return {"status": "success", "email": email, "type": "password_reset"}
    except Exception as exc:
        logger.error(f"Failed to send email to {email}. Retrying...")
        raise self.retry(exc=exc, countdown=5)

==================================================
FILE: backend/celery_worker.py
===========================

import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

def make_celery(app_name=__name__):
    broker_url = os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@localhost:5672//")
    
    celery = Celery(
        app_name,
        broker=broker_url
    )
    
    celery.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        imports=["tasks"]
    )
    return celery

celery_app = make_celery()

==================================================
FILE: backend/Dockerfile
===========================

FROM python:3.10-slim

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download TextBlob corpora during build
RUN python -m textblob.download_corpora

# Copy backend code
COPY . .

# Expose port for Flask
EXPOSE 5000

# Default command (overridden in docker-compose for celery)
CMD ["gunicorn", "-b", "0.0.0.0:5000", "--timeout", "120", "app:app"]

==================================================
FILE: docker-compose.yml
===========================

version: '3.8'

services:
  rabbitmq:
    image: rabbitmq:3-management
    container_name: moodmirror_rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    restart: unless-stopped

  web:
    image: moodmirror_backend
    container_name: moodmirror_web
    command: ["gunicorn", "-b", "0.0.0.0:5000", "--timeout", "300", "app:app"]
    ports:
      - "5000:5000"
    volumes:
      - ./backend:/app
    env_file:
      - ./backend/.env
    environment:
      - RABBITMQ_HOST=rabbitmq
    depends_on:
      - rabbitmq
    restart: unless-stopped

  worker:
    image: moodmirror_backend
    container_name: moodmirror_worker
    command: ["celery", "-A", "celery_worker.celery_app", "worker", "--loglevel=info"]
    volumes:
      - ./backend:/app
    env_file:
      - ./backend/.env
    environment:
      - RABBITMQ_HOST=rabbitmq
    depends_on:
      - rabbitmq
    restart: unless-stopped

==================================================
FILE: backend/requirements.txt
===========================

Flask
flask-cors
PyJWT
bcrypt
python-dotenv
celery
imageio-ffmpeg
pymongo
SpeechRecognition
gunicorn
--extra-index-url https://download.pytorch.org/whl/cpu
--extra-index-url https://download.pytorch.org/whl/cpu
torch==2.4.0+cpu
torchaudio==2.4.0+cpu
transformers==4.38.2
numpy<2.0.0
safetensors
librosa
textblob

==================================================
FILE: frontend/html_frontend/src/main.jsx
===========================

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

==================================================
FILE: frontend/html_frontend/src/App.jsx
===========================

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AudioCheckIn from './pages/AudioCheckIn';
import MoodTracker from './pages/MoodTracker';
import WellnessResources from './pages/WellnessResources';
import Profile from './pages/Profile';
import TextCheckIn from './pages/TextCheckIn';
import History from './pages/History';
import Help from './pages/Help';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import ResetPassword from './pages/ResetPassword';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('jwt_token');
  if (!token) {
    return <Navigate to="/signin" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/signin" replace />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Authenticated Routes with Layout */}
        <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/text" element={<ProtectedRoute><Layout><TextCheckIn /></Layout></ProtectedRoute>} />
        <Route path="/audio" element={<ProtectedRoute><Layout><AudioCheckIn /></Layout></ProtectedRoute>} />
        <Route path="/mood" element={<ProtectedRoute><Layout><MoodTracker /></Layout></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><Layout><History /></Layout></ProtectedRoute>} />
        <Route path="/wellness" element={<ProtectedRoute><Layout><WellnessResources /></Layout></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
        <Route path="/help" element={<ProtectedRoute><Layout><Help /></Layout></ProtectedRoute>} />
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;

==================================================
FILE: frontend/html_frontend/src/index.css
===========================

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    font-family: 'Inter', sans-serif;
    color: #0A3323; /* block.text */
    background-color: #F5F5DC; /* Light Beige */
    min-height: 100vh;
    line-height: 1.6;
    background-image: none; /* NO GRADIENTS */
  }
}

@layer components {
  .clean-card {
    /* Base style, background color is added specifically per card via React classes */
    @apply border border-[#0A3323]/5 rounded-2xl shadow-[0_4px_12px_rgba(10,51,35,0.04)] transition-transform duration-300;
  }
  
  .clean-card:hover {
    @apply -translate-y-1 shadow-[0_6px_16px_rgba(10,51,35,0.06)];
  }

  .btn-primary {
    @apply bg-[#0A3323] text-white font-semibold rounded-full px-6 py-3 transition-colors duration-200 hover:bg-[#105666] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm;
  }

  .btn-secondary {
    @apply bg-white border-2 border-[#0A3323] text-[#0A3323] font-semibold rounded-full px-6 py-3 transition-colors duration-200 hover:bg-[#F7F4D5] shadow-sm;
  }

  .form-input-clean {
    @apply w-full bg-white border-2 border-gray-200 rounded-xl px-5 py-3 text-[#0A3323] outline-none transition-all duration-200 focus:border-[#0A3323] focus:ring-0;
  }
}

/* Custom Webkit Scrollbar */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  @apply bg-[#0A3323]/20 rounded-full transition-colors;
}
::-webkit-scrollbar-thumb:hover {
  @apply bg-[#0A3323]/40;
}

==================================================
FILE: frontend/html_frontend/tailwind.config.js
===========================

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'block-navy': '#0A3323',
        'block-sage': '#839958',
        'block-pink': '#D3968C',
        'block-blue': '#105666',
        'block-yellow': '#F7F4D5',
        'block-bg': '#F7F4D5',
        'block-text': '#0A3323',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

==================================================
FILE: frontend/html_frontend/src/pages/AudioCheckIn.jsx
===========================

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Square, Upload, AlertCircle, FileAudio, CheckCircle2, Play, Pause, Trash2, Save, Loader2 } from 'lucide-react';
import Result from '../components/Result';

// IndexedDB Helper for storing audio blobs
const dbName = "MoodMirrorDB";
const storeName = "audio_recordings";

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

const saveAudioBlob = async (id, blob) => {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  store.put(blob, id);
  return tx.complete;
};

const AudioCheckIn = () => {
  const [activeTab, setActiveTab] = useState('record');
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let interval = null;
    if (isRecording) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTimer(0);
      setRecordedBlob(null);
      setAudioUrl(null);
      setError(null);
    } catch (err) {
      setError("Microphone access denied. Please enable microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFile = (selectedFile) => {
    setError(null);
    if (!selectedFile) return;
    const maxSize = 200 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      setError("File is too large. Please upload an audio file smaller than 200MB.");
      return;
    }
    if (!selectedFile.type.startsWith('audio/')) {
      setError("Invalid file type. Please upload an audio file (.mp3, .wav, .m4a).");
      return;
    }
    setFile(selectedFile);
    setAudioUrl(URL.createObjectURL(selectedFile));
  };

  const saveToHistory = async () => {
    const finalFile = recordedBlob || file;
    if (!finalFile) return;

    setIsAnalyzing(true);
    const id = `audio-${Date.now()}`;
    
    try {
      // 1. Save Blob to IndexedDB
      await saveAudioBlob(id, finalFile);

      // Simulate analysis delay
      const formData = new FormData();
      formData.append("audio", finalFile);
      formData.append("audioId", id);
      formData.append("duration", formatTime(timer));
      formData.append("fileName", file ? file.name : "Voice Recording");
    
      const token = localStorage.getItem('jwt_token');

      const response = await fetch(
       "https://140.245.251.56.sslip.io/predict-audio",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`
          },
          body: formData,
        }
      );
      
      if (response.status === 401) {
        localStorage.removeItem('jwt_token');
        navigate('/signin');
        return;
      }

      const data = await response.json();
      console.log("BACKEND RESPONSE:", data);
      const analysisResult = {
        message: "Your audio has been analyzed successfully.",
        severity: data.severity,
        score: data.score,
        disclaimer:
          "This analysis is for informational purposes only and is not a substitute for professional medical advice.",
      };

      // The backend automatically saves the prediction to MongoDB now.
      // We no longer need to manually append to localStorage.

      setResult(analysisResult);
      console.log("FINAL RESULT:", analysisResult);
      setIsAnalyzing(false);

// RESET
      setFile(null);
      setRecordedBlob(null);
      setAudioUrl(null);
    } catch (err) {
      setError("Failed to save check-in. Please try again.");
      setIsAnalyzing(false);
    }
  };

  const togglePlayback = () => {
    if (audioPlayerRef.current) {
      if (isPlaying) {
        audioPlayerRef.current.pause();
      } else {
        audioPlayerRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  if (result) {
    return <Result {...result} type="audio" />;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-block-navy mb-2">Audio Check-in</h2>
        <p className="text-base font-medium text-gray-500">Record a voice note or upload an existing audio file.</p>
      </div>

      <div className="clean-card overflow-hidden bg-block-sage border-none shadow-lg">
        <div className="flex border-b border-block-navy/10 bg-white/40 backdrop-blur-sm">
          <button
            onClick={() => { setActiveTab('record'); setError(null); setAudioUrl(null); setFile(null); }}
            className={`flex-1 py-5 text-sm font-bold transition-colors ${
              activeTab === 'record' 
                ? 'text-block-navy border-b-4 border-block-navy bg-white/60' 
                : 'text-block-navy/60 hover:text-block-navy hover:bg-white/20'
            }`}
          >
            Record Audio
          </button>
          <button
            onClick={() => { setActiveTab('upload'); setError(null); setAudioUrl(null); setRecordedBlob(null); }}
            className={`flex-1 py-5 text-sm font-bold transition-colors ${
              activeTab === 'upload' 
                ? 'text-block-navy border-b-4 border-block-navy bg-white/60' 
                : 'text-block-navy/60 hover:text-block-navy hover:bg-white/20'
            }`}
          >
            Upload File
          </button>
        </div>

        <div className="p-10 min-h-[450px] flex flex-col items-center justify-center">
          {audioUrl ? (
            <div className="w-full max-w-md flex flex-col items-center animate-in zoom-in duration-300">
              <div className="w-24 h-24 bg-white text-block-navy rounded-3xl flex items-center justify-center mb-8 shadow-md">
                {activeTab === 'record' ? <Mic size={40} /> : <FileAudio size={40} />}
              </div>
              
              <h3 className="text-xl font-bold text-block-navy mb-1">
                {activeTab === 'record' ? "Recording Captured" : "File Uploaded"}
              </h3>
              <p className="text-block-navy/60 font-bold text-sm mb-8">
                {activeTab === 'record' ? `Duration: ${formatTime(timer)}` : file.name}
              </p>

              <audio 
                ref={audioPlayerRef} 
                src={audioUrl} 
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />

              <div className="flex items-center gap-4 mb-10">
                <button 
                  onClick={togglePlayback}
                  className="w-16 h-16 bg-block-navy text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
                >
                  {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} className="ml-1" fill="currentColor" />}
                </button>
                <button 
                  onClick={() => { setAudioUrl(null); setFile(null); setRecordedBlob(null); }}
                  className="w-12 h-12 bg-white text-block-pink rounded-full flex items-center justify-center shadow-md hover:bg-block-pink/10 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              <button 
                onClick={saveToHistory}
                disabled={isAnalyzing}
                className="w-full bg-block-navy text-white font-bold py-4 rounded-2xl shadow-xl hover:bg-[#105666] transition-all flex items-center justify-center gap-3 transform hover:-translate-y-1 disabled:opacity-70 disabled:transform-none"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Analyzing Audio...
                  </>
                ) : (
                  <>
                    <Save size={20} /> Save to My History
                  </>
                )}
              </button>
            </div>
          ) : activeTab === 'record' ? (
            <div className="flex flex-col items-center">
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 mb-8 shadow-xl ${
                  isRecording 
                    ? 'bg-block-pink text-block-navy animate-pulse scale-110' 
                    : 'bg-white text-block-navy hover:scale-105'
                }`}
              >
                {isRecording ? <Square size={40} fill="currentColor" /> : <Mic size={48} />}
              </button>
              
              <div className="text-center h-24">
                {isRecording ? (
                  <div>
                    <div className="text-5xl font-mono text-block-navy font-black tracking-widest mb-3">
                      {formatTime(timer)}
                    </div>
                    <span className="text-block-pink text-sm font-bold flex items-center justify-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-block-pink animate-ping"></span> Recording Live...
                    </span>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-2xl font-black text-block-navy mb-2">Start Recording</h3>
                    <p className="text-block-navy/70 font-bold text-base uppercase tracking-wider">Tap to capture your thoughts</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-md">
              <input type="file" ref={fileInputRef} onChange={(e) => handleFile(e.target.files[0])} accept="audio/*" className="hidden" />
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileInputRef.current.click()}
                className={`border-3 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer flex flex-col items-center backdrop-blur-sm ${
                  isDragging ? 'bg-white border-block-navy scale-102 shadow-inner' : 'bg-white/40 border-block-navy/20 hover:bg-white/60'
                }`}
              >
                <div className="w-20 h-20 bg-white text-block-navy rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                  <Upload size={32} />
                </div>
                <h3 className="text-xl font-bold text-block-navy mb-2">Upload Audio File</h3>
                <p className="text-block-navy/70 font-medium text-sm mb-8">Drag and drop or browse (.mp3, .wav)</p>
                <button className="bg-block-navy text-white font-bold px-10 py-3.5 rounded-full shadow-md">Browse Files</button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-8 p-4 bg-block-pink/10 border border-block-pink/20 rounded-2xl flex items-start gap-3 w-full max-w-md">
              <AlertCircle className="text-block-pink mt-0.5" size={20} />
              <div>
                <p className="text-sm font-bold text-block-navy">Action Required</p>
                <p className="text-xs font-medium text-gray-600 mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioCheckIn;

==================================================
FILE: frontend/html_frontend/src/pages/Dashboard.jsx
===========================

import React, { useState, useEffect } from 'react';
import { MessageSquare, Mic, Calendar, Heart, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const quotes = [
  "You don't have to control your thoughts. You just have to stop letting them control you.",
  "Healing is not linear, and that's okay. Take it one day at a time.",
  "It’s okay to need a break. It’s okay to be unsure.",
  "Your present circumstances don't determine where you can go; they merely determine where you start."
];

const Dashboard = () => {
  const [lastCheckIn, setLastCheckIn] = useState(null);
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    const fetchMoods = async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        if (!token) return;
        const res = await fetch('https://140.245.251.56.sslip.io/api/moods', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const entries = await res.json();
          const dates = Object.keys(entries).sort((a, b) => new Date(b) - new Date(a));
          if (dates.length > 0) setLastCheckIn(entries[dates[0]]);
        }
      } catch (e) { console.error('Failed to load dashboard moods', e); }
    };
    fetchMoods();
    setQuoteIdx(Math.floor(Math.random() * quotes.length));
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Top Welcome Section */}
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-bold text-block-navy mb-2">Welcome back</h2>
        <p className="text-base text-gray-500 font-medium">How are you feeling today?</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Last Check-in Card */}
        <div className="lg:col-span-2 clean-card p-8 flex flex-col justify-center bg-white border border-gray-200">
          <h3 className="text-sm font-bold text-black-400 uppercase tracking-wider mb-5">Last Check-in</h3>

          {lastCheckIn ? (
            <div className="flex items-center gap-6">
              <div className="text-4xl bg-block-bg w-20 h-20 rounded-2xl flex items-center justify-center shadow-sm">
                {lastCheckIn.emoji}
              </div>
              <div>
                <div className="text-block-navy font-bold text-xl mb-1">
                  {new Date(lastCheckIn.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                {lastCheckIn.notes ? (
                  <p className="text-gray-600 font-medium text-base">"{lastCheckIn.notes}"</p>
                ) : (
                  <p className="text-gray-500 font-medium text-base">Intensity: {lastCheckIn.intensity}/10</p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 font-medium py-4 text-base">No recent check-ins. Take a moment to log your day.</div>
          )}
        </div>

        {/* Daily Inspiration */}
        <div className="lg:col-span-1 clean-card p-8 flex flex-col justify-center bg-[#efdc87] border-none">
          <h3 className="text-sm font-bold text-block-navy/60 uppercase tracking-wider mb-4">Daily Inspiration</h3>
          <p className="leading-relaxed font-bold text-block-navy text-lg">
            "{quotes[quoteIdx]}"
          </p>
        </div>
      </div>

      {/* Main Action Cards */}
      <h3 className="text-xl font-bold text-block-navy mb-5">Quick Actions</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <ActionCard
          to="/text"
          icon={<MessageSquare size={24} />}
          title="Text Check-in"
          desc="Write your thoughts and reflect"
          bgColor="bg-[#1C7387]"
          iconColor="text-[#1C7387]"
        />
        <ActionCard
          to="/audio"
          icon={<Mic size={24} />}
          title="Audio Check-in"
          desc="Record or upload voice notes"
          bgColor="bg-[#839958]"
          iconColor="text-[#839958]"
        />
        <ActionCard
          to="/mood"
          icon={<Calendar size={24} />}
          title="Mood Tracker"
          desc="View calendar and log emotions"
          bgColor="bg-[#D3968C]"
          iconColor="text-[#D3968C]"
        />
        <ActionCard
          to="/wellness"
          icon={<Heart size={24} />}
          title="Wellness Resources"
          desc="Exercises and tips for well-being"
          bgColor="bg-[#efdc87]"
          iconColor="text-[#0A3323]"
        />
      </div>
    </div>
  );
};

const ActionCard = ({ to, icon, title, desc, bgColor, iconColor }) => (
  <Link to={to} className={`clean-card p-6 flex items-center justify-between group border-none ${bgColor}`}>
    <div className="flex items-center gap-5">
      <div className={`w-16 h-16 rounded-xl bg-white flex items-center justify-center ${iconColor} transition-transform duration-300 shadow-sm group-hover:scale-105`}>
        {icon}
      </div>
      <div>
        <h4 className="text-lg font-bold mb-1 text-block-navy">{title}</h4>
        <p className="text-sm font-medium text-block-navy/80">{desc}</p>
      </div>
    </div>
    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-block-navy group-hover:bg-block-navy group-hover:text-white transition-colors shadow-sm">
      <ArrowRight size={20} />
    </div>
  </Link>
);

export default Dashboard;

==================================================
FILE: frontend/html_frontend/src/pages/Help.jsx
===========================

import React from 'react';
import Navbar from '../components/Navbar';
import { BookOpen, Shield, HelpCircle } from 'lucide-react';

const Help = () => {
  return (
    <div>
      <Navbar />
      <div className="container" style={{ marginTop: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2.5rem' }}>How can we help?</h2>
          <p style={{ fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
            Learn how to use MoodMirror and understand your mental health better.
          </p>
        </div>

        <div className="grid grid-cols-2" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="animate-fade-in" style={{
            backgroundColor: 'var(--card-bg)',
            padding: '2rem',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <BookOpen size={32} color="var(--primary-color)" style={{ marginBottom: '1rem' }} />
            <h3>Using the App</h3>
            <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>
              <li style={{ marginBottom: '0.5rem' }}>Choose between Text or Audio check-ins on the Dashboard.</li>
              <li style={{ marginBottom: '0.5rem' }}>Express your feelings honestly and openly.</li>
              <li style={{ marginBottom: '0.5rem' }}>Review your generated PHQ-8 score and insights.</li>
              <li>Track your progress over time in the Mood Tracker.</li>
            </ul>
          </div>

          <div className="animate-fade-in" style={{
            backgroundColor: 'var(--card-bg)',
            padding: '2rem',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <Shield size={32} color="var(--primary-color)" style={{ marginBottom: '1rem' }} />
            <h3>Privacy & Security</h3>
            <p>
              Your mental health data is strictly confidential. We do not share your text or audio entries with any third parties. All analyses are performed securely, and audio files are never stored permanently on our servers.
            </p>
          </div>
          
          <div className="animate-fade-in" style={{
            backgroundColor: 'var(--card-bg)',
            padding: '2rem',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-sm)',
            gridColumn: '1 / -1'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <HelpCircle size={32} color="var(--primary-color)" />
              <h3 style={{ margin: 0 }}>Crisis Resources</h3>
            </div>
            <p>
              MoodMirror is not a diagnostic tool or a substitute for professional help. 
              If you or someone you know is going through a tough time, please reach out for immediate support:
            </p>
            <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem' }}>
              <div style={{ backgroundColor: '#fff5f5', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #fc8181', flex: 1 }}>
                <strong>National Suicide Prevention Lifeline:</strong><br/>
                <span style={{ fontSize: '1.25rem', color: '#c53030', fontWeight: 'bold' }}>988</span>
              </div>
              <div style={{ backgroundColor: '#f0f4f8', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid var(--primary-color)', flex: 1 }}>
                <strong>Crisis Text Line:</strong><br/>
                Text HOME to <span style={{ fontWeight: 'bold' }}>741741</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;

==================================================
FILE: frontend/html_frontend/src/pages/History.jsx
===========================

import React, { useState, useMemo, useEffect } from 'react';
import ScoreChart from '../components/ScoreChart';
import HistoryList from '../components/HistoryList';
import { getMockData } from '../data/mockData';
import { Flame, Trophy } from 'lucide-react';

const History = () => {
  const [filterType, setFilterType] = useState('All');
  const [streak, setStreak] = useState(0);
  const [realHistory, setRealHistory] = useState([]);
  const mockData = getMockData();

  useEffect(() => {
    const fetchHistoryData = async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        if (!token) return;

        const [moodsRes, historyRes] = await Promise.all([
          fetch('https://140.245.251.56.sslip.io/api/moods', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('https://140.245.251.56.sslip.io/api/history', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (moodsRes.ok) {
          const entries = await moodsRes.json();
          const dates = Object.keys(entries).sort((a, b) => new Date(b) - new Date(a));
          let currentStreak = 0;
          if (dates.length > 0) {
            let currentDate = new Date();
            currentDate.setHours(0, 0, 0, 0);
            const lastEntryDate = new Date(dates[0]);
            lastEntryDate.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((currentDate - lastEntryDate) / (1000 * 60 * 60 * 24));
            if (diffDays <= 1) {
              for (let i = 0; i < dates.length; i++) {
                const entryDate = new Date(dates[i]);
                entryDate.setHours(0, 0, 0, 0);
                const expectedDate = new Date(lastEntryDate);
                expectedDate.setDate(lastEntryDate.getDate() - i);
                if (entryDate.getTime() === expectedDate.getTime()) {
                  currentStreak++;
                } else {
                  break;
                }
              }
            }
          }
          setStreak(currentStreak);
        }

        if (historyRes.ok) {
          const historyData = await historyRes.json();
          // The backend history API returns objects with `timestamp`, but the frontend expects `date`
          // Map it nicely. The mock data uses `date: '2023-10-01'` and `time: '14:30'`
          const mappedHistory = historyData.map(item => ({
            ...item,
            date: item.timestamp ? item.timestamp.split('T')[0] : new Date().toISOString().split('T')[0],
            time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '12:00 PM',
            score: item.score,
            severity: item.severity,
            type: item.type === 'audio' ? 'Audio' : 'Text',
            content: item.content || (item.type === 'audio' ? 'Audio recording analysis' : 'Text analysis')
          }));
          setRealHistory(mappedHistory);
        }
      } catch (err) {
        console.error('Failed to fetch history', err);
      }
    };

    fetchHistoryData();
  }, []);

  const combinedData = useMemo(() => {
    // Merge mock data with real data
    const combined = [...realHistory, ...mockData];
    // Filter by type
    let filtered = combined;
    if (filterType !== 'All') {
      filtered = combined.filter(entry => entry.type.toLowerCase() === filterType.toLowerCase());
    }
    // Sort by date (descending)
    return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [filterType, mockData, realHistory]);

  // For the chart, we need ascending order and entries with scores
  const chartData = useMemo(() => {
    return combinedData
      .filter(entry => entry.score !== undefined)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [combinedData]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col items-center mb-10 gap-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-block-navy mb-2">Your Progress History</h2>
          <p className="text-base font-medium text-gray-500">Review your past check-ins and emotional trends.</p>
        </div>

        {/* Streak & Stats Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          <div className="clean-card bg-orange-50 border-orange-100 p-6 flex items-center justify-between shadow-sm overflow-hidden relative">
            <div className="relative z-10">
              <p className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-1">Check-in Streak</p>
              <h3 className="text-4xl font-black text-block-navy">{streak} {streak === 1 ? 'Day' : 'Days'}</h3>
              <p className="text-sm font-medium text-block-navy/60 mt-1">Keep the momentum going!</p>
            </div>
            <div className="bg-white/80 p-4 rounded-2xl shadow-sm text-orange-500 z-10">
              <Flame size={40} fill="currentColor" strokeWidth={2.5} />
            </div>
            <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-orange-500/5 rounded-full blur-2xl"></div>
          </div>

          <div className="clean-card bg-block-blue/10 border-block-blue/10 p-6 flex items-center justify-between shadow-sm overflow-hidden relative">
            <div className="relative z-10">
              <p className="text-xs font-bold text-block-blue uppercase tracking-widest mb-1">Total Reflections</p>
              <h3 className="text-4xl font-black text-block-navy">{combinedData.length}</h3>
              <p className="text-sm font-medium text-block-navy/60 mt-1">Consistency is key to growth.</p>
            </div>
            <div className="bg-white/80 p-4 rounded-2xl shadow-sm text-block-blue z-10">
              <Trophy size={40} strokeWidth={2.5} />
            </div>
            <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-block-blue/10 rounded-full blur-2xl"></div>
          </div>
        </div>
        
        <div className="inline-flex bg-white p-2 rounded-full border border-gray-200 shadow-sm mt-4">
          {['All', 'Text', 'Audio'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-8 py-2.5 text-sm font-bold rounded-full transition-all ${
                filterType === type 
                  ? 'bg-block-navy text-white shadow-sm' 
                  : 'text-gray-500 hover:text-block-navy hover:bg-gray-50'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {combinedData.length > 0 ? (
        <>
          {chartData.length > 0 && (
            <div className="mb-10">
              <ScoreChart data={chartData} />
            </div>
          )}
          
          <div>
            <div className="flex items-center justify-between mb-5 px-2">
              <h3 className="text-lg font-bold text-block-navy">Past Entries</h3>
              <span className="text-white font-bold bg-block-navy px-4 py-1.5 rounded-full text-sm shadow-sm">
                {combinedData.length} total
              </span>
            </div>
            
            <HistoryList entries={combinedData} />
          </div>
        </>
      ) : (
        <div className="clean-card text-center p-16 bg-white border border-gray-200">
          <h3 className="text-xl font-bold text-block-navy mb-2">No history available yet</h3>
          <p className="text-gray-500 font-medium">Start a check-in to see your progress here.</p>
        </div>
      )}
    </div>
  );
};

export default History;

==================================================
FILE: frontend/html_frontend/src/pages/MoodTracker.jsx
===========================

import React, { useState, useEffect } from 'react';
import MoodEntryModal from '../components/MoodEntryModal';

const MoodTracker = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  
  useEffect(() => {
    const fetchMoods = async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        if (!token) return;
        const res = await fetch('https://140.245.251.56.sslip.io/api/moods', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setEntries(data || {});
        }
      } catch (e) {
        console.error('Failed to load mood entries', e);
      }
    };
    fetchMoods();
  }, []);

  const saveEntries = async (newEntries) => {
    setEntries(newEntries);
    try {
      const token = localStorage.getItem('jwt_token');
      if (!token) return;
      await fetch('https://140.245.251.56.sslip.io/api/moods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(newEntries)
      });
      window.dispatchEvent(new Event('moodUpdate'));
    } catch (e) {
      console.error('Failed to save mood entries', e);
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const days = Array(firstDay).fill(null).concat(Array.from({length: daysInMonth}, (_, i) => i + 1));

  const handleDayClick = (day) => {
    if (!day) return;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setIsModalOpen(true);
  };

  const isToday = (day) => {
    if (!day) return false;
    const today = new Date();
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center sm:text-left">
          <h2 className="text-3xl font-bold text-block-navy mb-2">Mood Calendar</h2>
          <p className="text-base text-gray-500 font-medium">Track and review your daily emotional state.</p>
        </div>
        <button 
          onClick={() => handleDayClick(new Date().getDate())}
          className="btn-primary"
        >
          Log Emotion
        </button>
      </div>

      <div className="clean-card p-8 bg-block-pink border-none">
        <div className="flex justify-between items-center mb-8 border-b border-block-navy/10 pb-5">
          <button 
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="text-block-navy/70 hover:text-block-navy font-bold px-5 py-2.5 bg-white/50 hover:bg-white rounded-full transition-colors text-sm"
          >
            Previous
          </button>
          <h3 className="text-xl font-bold text-block-navy m-0">
            {monthNames[month]} {year}
          </h3>
          <button 
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="text-block-navy/70 hover:text-block-navy font-bold px-5 py-2.5 bg-white/50 hover:bg-white rounded-full transition-colors text-sm"
          >
            Next
          </button>
        </div>

        <div className="grid grid-cols-7 gap-3 bg-transparent">
          {/* Headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center py-2 text-xs font-bold text-block-navy/60 uppercase tracking-wider">
              {d}
            </div>
          ))}
          
          {/* Days */}
          {days.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="bg-transparent min-h-[110px]" />;
            
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const entry = entries[dateStr];
            const today = isToday(day);
            
            return (
              <div 
                key={day}
                onClick={() => handleDayClick(day)}
                className={`
                  bg-block-bg rounded-2xl min-h-[110px] p-3 cursor-pointer transition-transform relative flex flex-col items-center hover:-translate-y-1 hover:shadow-sm border-2 ${today ? 'border-block-blue' : 'border-transparent'}
                `}
              >
                <span className={`text-sm font-bold mb-auto mt-1 ${today ? 'bg-block-blue text-block-navy w-8 h-8 rounded-full flex items-center justify-center shadow-sm' : 'text-gray-500'}`}>
                  {day}
                </span>
                
                {entry && (
                  <div className="text-3xl mb-3">
                    {entry.emoji}
                    <div className="w-2 h-2 rounded-full bg-block-sage absolute bottom-3 right-3 shadow-sm"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <MoodEntryModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialDate={selectedDate}
        existingEntry={entries[selectedDate]}
        onSave={(e) => saveEntries({...entries, [e.date]: e})}
        onDelete={(d) => { const n = {...entries}; delete n[d]; saveEntries(n); }}
      />
    </div>
  );
};

export default MoodTracker;

==================================================
FILE: frontend/html_frontend/src/pages/Profile.jsx
===========================

import React, { useState, useEffect } from 'react';

const Profile = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch('https://140.245.251.56.sslip.io/api/user/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setName(data.name || data.email.split('@')[0]);
          setEmail(data.email || '');
        }
      } catch (err) {
        console.error('Failed to fetch profile', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('jwt_token');
      const response = await fetch('https://140.245.251.56.sslip.io/api/user/profile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ name })
      });
      if (response.ok) {
        alert('Changes saved successfully.');
        window.dispatchEvent(new Event('storage'));
      } else {
        alert('Failed to save changes.');
      }
    } catch (err) {
      alert('An error occurred.');
    }
  };

  if (isLoading) return <div className="max-w-2xl mx-auto opacity-50">Loading profile...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-block-navy mb-2">Your Profile</h2>
        <p className="text-base font-medium text-gray-500">Update your account information and security settings.</p>
      </div>

      <form onSubmit={handleSave}>
        <div className="clean-card p-8 mb-8 bg-white border border-gray-200">
          <h3 className="text-lg font-bold text-block-navy mb-5 border-b border-gray-100 pb-3">Personal Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Full Name</label>
              <input 
                type="text" 
                className="form-input-clean text-sm" 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Email Address</label>
              <input 
                type="email" 
                className="form-input-clean text-sm" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="clean-card p-8 mb-8 bg-white border border-gray-200">
          <h3 className="text-lg font-bold text-block-navy mb-5 border-b border-gray-100 pb-3">Security</h3>
          
          <div className="space-y-6">
            <div className="max-w-sm">
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Current Password</label>
              <input type="password" placeholder="••••••••" className="form-input-clean text-sm" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">New Password</label>
                <input type="password" placeholder="Create new password" className="form-input-clean text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Confirm Password</label>
                <input type="password" placeholder="Confirm new password" className="form-input-clean text-sm" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="submit" className="btn-primary text-base px-8 py-3">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};

export default Profile;

==================================================
FILE: frontend/html_frontend/src/pages/ResetPassword.jsx
===========================

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenParam = params.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setError('Invalid password reset link. No token found.');
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      setError('Cannot reset password without a valid token.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    
    setError('');
    setSuccessMsg('');
    setIsLoading(true);
    
    try {
      const response = await fetch('https://140.245.251.56.sslip.io/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccessMsg(data.message || 'Password reset successfully! You can now log in.');
        setTimeout(() => {
          navigate('/signin');
        }, 3000);
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch (err) {
      setError('An error occurred. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-block-navy flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-block-bg">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="w-20 h-20 bg-block-navy rounded-2xl flex items-center justify-center text-white font-bold text-4xl mx-auto mb-6 shadow-sm">
          M
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-block-navy">Reset Password</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="clean-card py-10 px-4 sm:px-10 bg-white border border-gray-200">
          {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm text-center">{error}</div>}
          {successMsg && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded text-sm text-center">{successMsg}</div>}
          
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-bold text-block-navy mb-2">
                New Password
              </label>
              <input
                type="password"
                required
                className="form-input-clean shadow-sm text-base p-3"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={!token}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-block-navy mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                className="form-input-clean shadow-sm text-base p-3"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={!token}
              />
            </div>

            <div className="pt-4">
              <button type="submit" disabled={isLoading || !token} className="btn-primary w-full text-center flex justify-center text-lg py-3.5 disabled:opacity-50">
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
            
            <div className="text-center mt-4 text-sm font-bold">
               <Link to="/signin" className="text-block-pink hover:text-block-navy hover:underline transition-colors">
                 Back to login
               </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

==================================================
FILE: frontend/html_frontend/src/pages/SignIn.jsx
===========================

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const SignIn = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    
    setError('');
    setSuccessMsg('');
    try {
      const response = await fetch('https://140.245.251.56.sslip.io/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessMsg(data.message || 'If an account exists, a reset link will be sent shortly.');
      } else {
        setError(data.error || 'Failed to request password reset.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);
    
    try {
      const response = await fetch('https://140.245.251.56.sslip.io/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        localStorage.setItem('jwt_token', data.token);
        // Do not store profile data in localStorage
        navigate('/dashboard');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-block-navy flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-block-bg">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="w-20 h-20 bg-block-navy rounded-2xl flex items-center justify-center text-white font-bold text-4xl mx-auto mb-6 shadow-sm">
          M
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-block-navy">Welcome back</h2>
        <p className="mt-3 text-base font-medium text-gray-500">
          New to MoodMirror?{' '}
          <Link to="/signup" className="font-bold text-block-pink hover:text-block-navy hover:underline transition-colors">
            Create an account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="clean-card py-10 px-4 sm:px-10 bg-white border border-gray-200">
          {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm text-center">{error}</div>}
          {successMsg && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded text-sm text-center">{successMsg}</div>}
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-bold text-block-navy mb-2">
                Email address
              </label>
              <input
                type="email"
                required
                className="form-input-clean shadow-sm text-base p-3"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-block-navy mb-2">
                Password
              </label>
              <input
                type="password"
                required
                className="form-input-clean shadow-sm text-base p-3"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-5 w-5 text-block-navy focus:ring-block-navy/30 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm font-bold text-gray-600">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <button type="button" onClick={handleForgotPassword} className="font-bold text-block-pink hover:text-block-navy hover:underline">
                  Forgot password?
                </button>
              </div>
            </div>

            <div className="pt-4">
              <button type="submit" disabled={isLoading} className="btn-primary w-full text-center flex justify-center text-lg py-3.5 disabled:opacity-50">
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignIn;

==================================================
FILE: frontend/html_frontend/src/pages/SignUp.jsx
===========================

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const SignUp = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const response = await fetch('https://140.245.251.56.sslip.io/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        navigate('/signin');
      } else {
        setError(data.error || 'Signup failed');
      }
    } catch (err) {
      setError('An error occurred during signup');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-block-navy flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-block-bg">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="w-20 h-20 bg-block-navy rounded-2xl flex items-center justify-center text-white font-bold text-4xl mx-auto mb-6 shadow-sm">
          M
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-block-navy">Create your account</h2>
        <p className="mt-3 text-base font-medium text-gray-500">
          Already have an account?{' '}
          <Link to="/signin" className="font-bold text-block-pink hover:text-block-navy hover:underline transition-colors">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="clean-card py-10 px-4 sm:px-10 bg-white border border-gray-200">
          {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm text-center">{error}</div>}
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-bold text-block-navy mb-2">
                Email address
              </label>
              <input
                type="email"
                required
                className="form-input-clean shadow-sm text-base p-3"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-block-navy mb-2">
                Password
              </label>
              <input
                type="password"
                required
                className="form-input-clean shadow-sm text-base p-3"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="pt-4">
              <button type="submit" disabled={isLoading} className="btn-primary w-full text-center flex justify-center text-lg py-3.5 disabled:opacity-50">
                {isLoading ? 'Creating...' : 'Create account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignUp;

==================================================
FILE: frontend/html_frontend/src/pages/TextCheckIn.jsx
===========================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Result from '../components/Result';

const TextCheckIn = () => {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const response = await fetch("https://140.245.251.56.sslip.io/predict-text",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },

        body: JSON.stringify({
        text: text,
        }),
      }
      );
      
      if (response.status === 401) {
        localStorage.removeItem('jwt_token');
        navigate('/signin');
        return;
      }

      const data = await response.json();

      const analysisResult = {
        message: "Your text has been analyzed successfully.",
        severity: data.severity,
        score: data.score,
        disclaimer:
          "This analysis is for informational purposes only and is not a substitute for professional medical advice.",
      };

      // The backend automatically saves the prediction to MongoDB now.
      // We no longer need to manually append to localStorage.

      setResult(analysisResult);

      setIsSubmitting(false);
    } catch (error) {
      console.error('Error analyzing text:', error);
      setIsSubmitting(false);
    }
  };

  if (result) {
    return <Result {...result} type="text" />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-block-navy mb-2">Text Check-in</h2>
        <p className="text-base font-medium text-gray-500">Write freely about your day or how you are feeling.</p>
      </div>

      <div className="clean-card p-10 bg-block-navy border-none shadow-xl">
        <form onSubmit={handleSubmit}>
          <div className="mb-8">
            <textarea
              className="form-input-clean w-full resize-y text-lg p-8 bg-white border-4 border-transparent focus:border-block-blue focus:ring-0 shadow-inner rounded-3xl"
              style={{ minHeight: '350px' }}
              placeholder="How are you really feeling today? Write it down here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              className="bg-white/10 border-2 border-white/30 text-white font-bold rounded-full px-8 py-3 transition-all duration-200 hover:bg-white/20 shadow-sm"
              onClick={() => setText('')}
              disabled={isSubmitting || !text}
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !text.trim()}
              className="bg-white text-block-navy font-bold px-12 py-3 rounded-full hover:bg-block-blue transition-all shadow-lg transform hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 min-w-[180px]"
            >
              {isSubmitting ? 'Reflecting...' : 'Save Reflection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TextCheckIn;

==================================================
FILE: frontend/html_frontend/src/pages/WellnessResources.jsx
===========================

import React, { useState, useEffect } from 'react';

const tips = [
  { title: "Daily Gratitude", desc: "Write down 3 things you're thankful for today.", bg: "bg-[#efdc87]" },
  { title: "Sleep Schedule", desc: "Try to go to bed and wake up at the same time.", bg: "bg-[#1C7387]" },
  { title: "Stay Active", desc: "Take a 15-minute walk outside to refresh your mind.", bg: "bg-[#839958]" },
  { title: "Mindfulness", desc: "Spend 5 minutes simply noticing your surroundings.", bg: "bg-[#D3968C]" },
  { title: "Connect", desc: "Reach out to a friend or family member just to say hi.", bg: "bg-[#efdc87]" },
  { title: "Limit Screens", desc: "Disconnect from social media an hour before bed.", bg: "bg-[#1C7387]" },
];

const WellnessResources = () => {
  const [breathingMode, setBreathingMode] = useState('box');
  const [isBreathing, setIsBreathing] = useState(false);
  const [phase, setPhase] = useState('Ready?');
  const [scale, setScale] = useState(1);
  const [transitionDuration, setTransitionDuration] = useState('0.5s');

  const [sessionDuration, setSessionDuration] = useState(1);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    let interval;
    if (isBreathing && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => prev - 1);
      }, 1000);
    } else if (isBreathing && timeRemaining <= 0) {
      setIsBreathing(false);
      setIsCompleted(true);
    }
    return () => clearInterval(interval);
  }, [isBreathing, timeRemaining]);

  const toggleBreathing = () => {
    if (!isBreathing) {
      setTimeRemaining(sessionDuration * 60);
      setIsCompleted(false);
      setIsBreathing(true);
    } else {
      setIsBreathing(false);
    }
  };

  useEffect(() => {
    let timeoutId;
    let isActive = true;

    if (!isBreathing) {
      setPhase('Ready?');
      setScale(1);
      setTransitionDuration('0.5s');
      return;
    }

    const runCycle = () => {
      if (!isActive) return;

      if (breathingMode === 'box') {
        setPhase('Inhale... (4s)');
        setScale(1.5);
        setTransitionDuration('4s');
        
        timeoutId = setTimeout(() => {
          if (!isActive) return;
          setPhase('Hold... (4s)');
          
          timeoutId = setTimeout(() => {
            if (!isActive) return;
            setPhase('Exhale... (4s)');
            setScale(1);
            setTransitionDuration('4s');
            
            timeoutId = setTimeout(() => {
              if (!isActive) return;
              setPhase('Hold... (4s)');
              
              timeoutId = setTimeout(runCycle, 4000);
            }, 4000);
          }, 4000);
        }, 4000);
      } else if (breathingMode === '4-7-8') {
        setPhase('Inhale... (4s)');
        setScale(1.5);
        setTransitionDuration('4s');
        
        timeoutId = setTimeout(() => {
          if (!isActive) return;
          setPhase('Hold... (7s)');
          
          timeoutId = setTimeout(() => {
            if (!isActive) return;
            setPhase('Exhale... (8s)');
            setScale(1);
            setTransitionDuration('8s');
            
            timeoutId = setTimeout(runCycle, 8000);
          }, 7000);
        }, 4000);
      } else {
        setPhase('Inhale... (5s)');
        setScale(1.5);
        setTransitionDuration('5s');
        
        timeoutId = setTimeout(() => {
          if (!isActive) return;
          setPhase('Exhale... (5s)');
          setScale(1);
          setTransitionDuration('5s');
          
          timeoutId = setTimeout(runCycle, 5000);
        }, 5000);
      }
    };

    runCycle();

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [isBreathing, breathingMode]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-block-navy mb-2">Wellness Resources</h2>
        <p className="text-base text-gray-500 font-medium">Evidence-based practices and exercises.</p>
      </div>

      {/* Breathing Exercise */}
      <div className="clean-card p-10 text-center mb-10 bg-[#1C7387] border-none">
        <h3 className="text-xl font-bold text-[#0A3323] mb-2">Guided Breathing</h3>
        <p className="text-[#0A3323]/80 font-medium text-base mb-8">Select a technique and follow the pace.</p>

        <div className="flex justify-center gap-3 mb-10">
          {['box', '4-7-8', 'calm'].map((mode) => (
            <button
              key={mode}
              onClick={() => setBreathingMode(mode)}
              className={`px-6 py-2.5 text-sm font-bold rounded-full transition-colors ${breathingMode === mode
                ? 'bg-[#0A3323] text-white shadow-sm'
                : 'bg-white text-[#0A3323] hover:bg-gray-50 border border-transparent'
                }`}
            >
              {mode === 'box' ? 'Box Breathing' : mode === '4-7-8' ? '4-7-8 Technique' : 'Deep Calm'}
            </button>
          ))}
        </div>

        {!isBreathing && (
          <div className="mb-8">
            <p className="text-[#0A3323]/90 font-bold mb-3 text-sm uppercase tracking-wider">Session Duration</p>
            <div className="flex justify-center gap-3">
              {[1, 2, 5, 10].map((min) => (
                <button
                  key={min}
                  onClick={() => setSessionDuration(min)}
                  className={`px-5 py-2 text-sm font-bold rounded-full transition-colors ${
                    sessionDuration === min
                      ? 'bg-[#0A3323] text-white shadow-sm'
                      : 'bg-white text-[#0A3323] hover:bg-gray-50 border border-transparent shadow-sm'
                  }`}
                >
                  {min} min
                </button>
              ))}
            </div>
          </div>
        )}

        {isBreathing && (
          <div className="mb-8">
            <p className="text-5xl font-bold text-[#0A3323]">
              {Math.floor(timeRemaining / 60).toString().padStart(2, '0')}:
              {(timeRemaining % 60).toString().padStart(2, '0')}
            </p>
          </div>
        )}

        {isCompleted && !isBreathing && (
          <div className="mb-8 p-4 bg-[#0A3323]/10 rounded-2xl max-w-sm mx-auto">
            <p className="text-[#0A3323] font-bold text-lg">Session complete. Good job. 🎉</p>
          </div>
        )}

        <div className="h-48 flex items-center justify-center relative mb-8">
          <div
            onClick={toggleBreathing}
            className="w-32 h-32 rounded-full flex items-center justify-center text-[#0A3323] text-base font-bold bg-white transition-all shadow-md cursor-pointer hover:bg-gray-50"
            style={{
              transform: `scale(${scale})`,
              transitionDuration: transitionDuration,
              transitionTimingFunction: 'ease-in-out'
            }}
          >
            {phase}
          </div>
        </div>

        <button
          onClick={toggleBreathing}
          className="bg-[#0A3323] text-white font-bold px-8 py-3 rounded-full hover:bg-[#1C7387] transition-colors shadow-sm"
        >
          {isBreathing ? 'Stop Exercise' : 'Start Breathing'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tips Grid */}
        <div className="lg:col-span-2">
          <h3 className="text-xl font-bold text-[#0A3323] mb-5">Daily Habits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {tips.map((tip, idx) => (
              <div key={idx} className={`clean-card p-6 ${tip.bg} ${tip.bg.includes('white') ? '' : 'border-none'}`}>
                <h4 className="text-lg font-bold text-[#0A3323] mb-2">{tip.title}</h4>
                <p className={`text-sm font-medium ${tip.bg.includes('white') ? 'text-gray-600' : 'text-[#0A3323]/80'}`}>{tip.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Hotlines */}
        <div className="lg:col-span-1">
          <h3 className="text-xl font-bold text-[#0A3323] mb-5">Support Hotlines</h3>
          <div className="clean-card p-6 bg-[#D3968C] border-none">
            <p className="text-[#0A3323] text-sm mb-5 font-bold">Confidential help is available 24/7.</p>

            <div className="space-y-4">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <strong className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">National Crisis Line</strong>
                <span className="text-2xl font-bold text-[#0A3323]">988</span>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <strong className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Crisis Text Line</strong>
                <span className="text-xl font-bold text-[#0A3323]">Text HOME to 741741</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default WellnessResources;

==================================================
FILE: frontend/html_frontend/src/components/BackgroundBlobs.jsx
===========================

import React from 'react';

const BackgroundBlobs = () => {
  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
      <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-96 h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
    </div>
  );
};

export default BackgroundBlobs;

==================================================
FILE: frontend/html_frontend/src/components/Card.jsx
===========================

import React from 'react';
import { Link } from 'react-router-dom';

const Card = ({ title, description, buttonText, linkTo, icon: Icon }) => {
  return (
    <div className="card animate-fade-in" style={{
      backgroundColor: 'var(--card-bg)',
      borderRadius: 'var(--border-radius)',
      padding: '2rem',
      boxShadow: 'var(--shadow-md)',
      transition: 'var(--transition)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      height: '100%'
    }}>
      {Icon && (
        <div style={{
          backgroundColor: 'var(--secondary-color)',
          color: 'var(--text-main)',
          padding: '1rem',
          borderRadius: '50%',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Icon size={32} />
        </div>
      )}
      <h3 style={{ marginBottom: '0.5rem' }}>{title}</h3>
      <p style={{ flexGrow: 1, marginBottom: '1.5rem' }}>{description}</p>
      <Link to={linkTo} className="btn btn-primary btn-block">
        {buttonText}
      </Link>
    </div>
  );
};

export default Card;

==================================================
FILE: frontend/html_frontend/src/components/Chart.jsx
===========================

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Chart = ({ data }) => {
  return (
    <div style={{
      backgroundColor: 'var(--card-bg)',
      borderRadius: 'var(--border-radius)',
      padding: '2rem',
      boxShadow: 'var(--shadow-md)',
      height: '400px',
      width: '100%'
    }}>
      <h3 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Mood Trends (PHQ-8 Score)</h3>
      <ResponsiveContainer width="100%" height="80%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey="date" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-muted)' }}
            dy={10}
          />
          <YAxis 
            domain={[0, 24]} 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-muted)' }}
            dx={-10}
          />
          <Tooltip 
            contentStyle={{ 
              borderRadius: '8px', 
              border: 'none',
              boxShadow: 'var(--shadow-sm)' 
            }} 
          />
          <Line 
            type="monotone" 
            dataKey="score" 
            stroke="var(--primary-color)" 
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Chart;

==================================================
FILE: frontend/html_frontend/src/components/Header.jsx
===========================

import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Bell, Sparkles, X, Heart, LogOut } from 'lucide-react';

const Header = () => {
  const location = useLocation();
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [notifications, setNotifications] = React.useState([]);
  const [activePopover, setActivePopover] = React.useState(null);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard': return 'Dashboard';
      case '/text': return 'Text Check-in';
      case '/audio': return 'Audio Check-in';
      case '/mood': return 'Mood Tracker';
      case '/history': return 'History';
      case '/wellness': return 'Wellness Resources';
      case '/profile': return 'Profile';
      case '/help': return 'Help';
      default: return 'MoodMirror';
    }
  };

  const refreshNotifications = React.useCallback(async (isProactive = false) => {
    try {
      const token = localStorage.getItem('jwt_token');
      if (!token) return;

      const [moodsRes, notifsRes] = await Promise.all([
        fetch('https://140.245.251.56.sslip.io/api/moods', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('https://140.245.251.56.sslip.io/api/notifications', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const entries = await moodsRes.json();
      const readIds = await notifsRes.json();
      const list = [];

      const dateKeys = Object.keys(entries).sort((a, b) => new Date(b) - new Date(a));

      if (!dateKeys || dateKeys.length === 0) {
        setNotifications([]);
        return;
      }
      
      const lastEntry = entries[dateKeys[0]];
      const todayStr = new Date().toISOString().split('T')[0];
      const entryDate = dateKeys[0];
      const isToday = entryDate === todayStr;

      const emoji = lastEntry.emoji || '🙂';
      const suggestionId = `suggestion-${entryDate}-${emoji}`;
      const isSadMood = emoji === '😞' || emoji === '😫';
      const isGoodMood = emoji === '🙂';
      
      if (isToday || !readIds.includes(suggestionId)) {
        if (isSadMood) {
          const suggestion = {
            id: suggestionId,
            type: 'suggestion',
            icon: <Sparkles size={16} className="text-block-blue" />,
            title: 'Smart Suggestion',
            text: 'Feeling a bit heavy? Try a 2-minute "Deep Calm" session.',
            link: '/wellness',
            time: isToday ? 'Current Mood' : 'Just now'
          };
          list.push(suggestion);
          
          if (isProactive) {
            setActivePopover(suggestion);
            setTimeout(() => setActivePopover(null), 10000);
          }
        } else if (isGoodMood) {
          list.push({
            id: suggestionId,
            type: 'suggestion',
            icon: <Heart size={16} className="text-block-pink" />,
            title: 'Positivity Tip',
            text: 'You are in a great headspace. Spread the positivity! ✨',
            time: isToday ? 'Current Mood' : 'Just now'
          });
        }
      }
      setNotifications(list);
    } catch (e) { 
      console.error('Failed to load notifications', e);
    }
  }, []);

  const updateReadNotifications = async (newIds) => {
    try {
      const token = localStorage.getItem('jwt_token');
      await fetch('https://140.245.251.56.sslip.io/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ read_notifications: newIds })
      });
    } catch (e) { console.error('Failed to update read notifications', e); }
  };

  const markAllAsRead = async () => {
    const currentIds = notifications.map(n => n.id);
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch('https://140.245.251.56.sslip.io/api/notifications', { headers: { 'Authorization': `Bearer ${token}` } });
      const existingRead = await res.json();
      const updatedRead = [...new Set([...existingRead, ...currentIds])];
      await updateReadNotifications(updatedRead);
      setNotifications([]);
    } catch (e) {}
  };

  const markSingleAsRead = async (id) => {
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch('https://140.245.251.56.sslip.io/api/notifications', { headers: { 'Authorization': `Bearer ${token}` } });
      const existingRead = await res.json();
      if (!existingRead.includes(id)) {
        await updateReadNotifications([...existingRead, id]);
      }
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e) {}
  };

  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_email');
    navigate('/');
  };

  React.useEffect(() => {
    refreshNotifications();
    const handleUpdate = () => {
      // Clear proactive popover first to re-trigger animation if already showing
      setActivePopover(null);
      setTimeout(() => refreshNotifications(true), 50);
    };
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('moodUpdate', handleUpdate);
    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('moodUpdate', handleUpdate);
    };
  }, [refreshNotifications, location.pathname]);

  return (
    <header className="h-20 bg-block-bg/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-8 sticky top-0 z-30 transition-colors duration-300">
      <h1 className="text-2xl font-bold text-block-navy">{getPageTitle()}</h1>
      
      <div className="flex items-center gap-5">
        <div className="relative">
          {activePopover && (
            <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 w-64 bg-block-navy text-white p-4 rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-start gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <Sparkles size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">New Suggestion</p>
                  <p className="text-sm font-bold leading-snug">{activePopover.text}</p>
                  <Link to="/wellness" onClick={() => setActivePopover(null)} className="text-xs font-bold text-block-pink mt-2 inline-block hover:underline">
                    Start Exercise →
                  </Link>
                </div>
                <button onClick={() => setActivePopover(null)} className="text-white/40 hover:text-white">
                  <X size={14} />
                </button>
              </div>
              <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 bg-block-navy rotate-45"></div>
            </div>
          )}

          <button 
            onClick={() => {
              setShowNotifications(!showNotifications);
              setActivePopover(null);
            }}
            className={`relative p-2.5 text-gray-500 hover:text-block-navy hover:bg-white rounded-full transition-all shadow-sm bg-white border border-gray-200 ${activePopover ? 'animate-bounce ring-2 ring-block-navy scale-110' : ''}`}
          >
            <Bell size={20} />
            {notifications.length > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-block-pink rounded-full border-2 border-white"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                <span className="text-sm font-bold text-block-navy uppercase tracking-wider">Smart Suggestions</span>
                <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-block-navy">
                  <X size={16} />
                </button>
              </div>
              
              <div className="max-h-[350px] overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div key={n.id} className="px-5 py-4 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 relative group">
                      <button 
                        onClick={() => markSingleAsRead(n.id)}
                        className="absolute top-4 right-4 text-gray-300 hover:text-block-pink opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={14} />
                      </button>
                      <div className="flex gap-3 pr-4">
                        <div className="mt-1 w-8 h-8 rounded-full bg-block-bg flex items-center justify-center shrink-0">
                          {n.icon}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-block-navy mb-0.5">{n.title}</p>
                          <p className="text-sm font-medium text-gray-500 leading-snug">{n.text}</p>
                          {n.link && (
                            <Link 
                              to={n.link} 
                              onClick={() => setShowNotifications(false)}
                              className="text-xs font-bold text-block-blue mt-2 inline-block hover:underline"
                            >
                              View Wellness Page →
                            </Link>
                          )}
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">{n.time}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-10 text-center">
                    <p className="text-sm font-medium text-gray-400">No new suggestions</p>
                  </div>
                )}
              </div>
              
              <div className="px-5 py-3 text-center border-t border-gray-50">
                <button 
                  onClick={markAllAsRead}
                  className="text-xs font-bold text-block-navy/60 hover:text-block-navy uppercase tracking-widest disabled:opacity-30"
                  disabled={notifications.length === 0}
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={handleLogout}
          className="p-2.5 text-gray-500 hover:text-block-pink hover:bg-white rounded-full transition-all shadow-sm bg-white border border-gray-200 flex items-center gap-2 group"
          title="Logout"
        >
          <LogOut size={20} className="group-hover:translate-x-0.5 transition-transform" />
          <span className="text-sm font-bold pr-1 hidden sm:inline">Logout</span>
        </button>
        </div>
    </header>
  );
};

export default Header;

==================================================
FILE: frontend/html_frontend/src/components/HistoryList.jsx
===========================

import React, { useState, useRef } from 'react';
import { FileText, Mic, Play, Pause, Volume2 } from 'lucide-react';

// IndexedDB Helper for fetching audio blobs
const dbName = "MoodMirrorDB";
const storeName = "audio_recordings";

const getAudioBlob = async (id) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const getRequest = store.get(id);
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    };
    request.onerror = (event) => reject(event.target.error);
  });
};

const HistoryList = ({ entries }) => {
  const [playingId, setPlayingId] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);

  const getSeverityStyle = (sev) => {
    if (!sev) return 'text-gray-500 bg-gray-100';
    switch(sev.toLowerCase()) {
      case 'minimal': return 'text-block-navy bg-white border border-gray-200';
      case 'mild': return 'text-block-navy bg-block-blue border-none';
      case 'moderate': return 'text-block-navy bg-block-sage border-none';
      case 'moderately severe': return 'text-block-navy bg-block-yellow border-none';
      case 'severe': return 'text-block-navy bg-block-pink border-none shadow-sm';
      default: return 'text-gray-500 bg-gray-100 border border-gray-200';
    }
  };

  const handlePlayAudio = async (entry) => {
    if (playingId === entry.id) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }

    try {
      const blob = await getAudioBlob(entry.audioId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setPlayingId(entry.id);
        // Play is handled by useEffect or autoPlay after URL is set
      }
    } catch (err) {
      console.error("Failed to load audio", err);
    }
  };

  if (!entries || entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          autoPlay 
          onEnded={() => { setPlayingId(null); setAudioUrl(null); }}
          className="hidden"
        />
      )}

      {entries.map((entry) => (
        <div 
          key={entry.id} 
          className="clean-card p-6 flex justify-between items-center bg-white hover:-translate-y-1 hover:shadow-md transition-all border border-gray-200 group"
        >
          <div className="flex items-center gap-5">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center border-none transition-transform group-hover:scale-105 ${entry.type.toLowerCase() === 'text' ? 'bg-block-blue text-block-navy' : 'bg-block-sage text-block-navy'}`}>
              {entry.type.toLowerCase() === 'text' ? <FileText size={24} /> : <Mic size={24} />}
            </div>
            <div>
              <h4 className="text-lg font-bold text-block-navy m-0">{entry.date}</h4>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-gray-500 text-sm font-medium">{entry.time}</span>
                <span className="text-xs font-bold tracking-wider px-3 py-1 rounded-full bg-gray-100 text-gray-500">
                  {entry.type}
                </span>
                {entry.type.toLowerCase() === 'audio' && entry.audioId && (
                  <button 
                    onClick={() => handlePlayAudio(entry)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      playingId === entry.id 
                        ? 'bg-block-navy text-white animate-pulse' 
                        : 'bg-block-sage/20 text-block-navy hover:bg-block-sage/40'
                    }`}
                  >
                    {playingId === entry.id ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                    {playingId === entry.id ? 'Playing...' : 'Play Recording'}
                  </button>
                )}
              </div>
            </div>
          </div>
          
          <div className="text-right flex flex-col items-end">
            {entry.score !== undefined ? (
              <>
                <div className="text-3xl font-bold text-block-navy mb-2">
                  {entry.score}<span className="text-sm font-medium text-gray-400 ml-1">/24</span>
                </div>
                <div className="flex items-center gap-2">
                  {entry.type.toLowerCase() === 'audio' && entry.duration && (
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                      {entry.duration}
                    </span>
                  )}
                  <div className={`text-xs font-bold px-4 py-1.5 rounded-full ${getSeverityStyle(entry.severity)}`}>
                    {entry.severity}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center gap-2">
                <Volume2 size={16} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{entry.duration || '00:00'}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default HistoryList;

==================================================
FILE: frontend/html_frontend/src/components/Layout.jsx
===========================

import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = ({ children }) => {
  return (
    <div className="flex min-h-screen font-sans">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;

==================================================
FILE: frontend/html_frontend/src/components/Modal.jsx
===========================

import React from 'react';

const Modal = ({ isOpen, onClose, children, title }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(243, 232, 255, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div className="animate-fade-in card" style={{
        width: '100%',
        maxWidth: '500px',
        padding: '2.5rem',
        position: 'relative',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        {title && <h3 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>{title}</h3>}
        {children}
      </div>
    </div>
  );
};

export default Modal;

==================================================
FILE: frontend/html_frontend/src/components/MoodEntryModal.jsx
===========================

import React, { useState, useEffect } from 'react';

const emojis = ['🙂', '😐', '😞', '😫', '😶'];

const MoodEntryModal = ({ isOpen, onClose, initialDate, existingEntry, onSave, onDelete }) => {
  const [emoji, setEmoji] = useState('🙂');
  const [intensity, setIntensity] = useState(5);
  const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEmoji(existingEntry?.emoji || '🙂');
      setIntensity(existingEntry?.intensity || 5);
      setDate(existingEntry?.date || initialDate || new Date().toISOString().split('T')[0]);
      setNotes(existingEntry?.notes || '');
    }
  }, [isOpen, existingEntry, initialDate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ emoji, intensity, date, notes });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-block-navy/40 backdrop-blur-sm transition-all duration-300">
      
      <div className="bg-block-bg border border-white rounded-3xl shadow-xl w-full max-w-md p-8 relative">
        <h3 className="text-2xl font-bold text-block-navy mb-6">
          {existingEntry ? "Edit Entry" : "How are you feeling?"}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-500 mb-3">Emotion</label>
            <div className="flex gap-3 justify-between">
              {emojis.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`text-3xl p-3 rounded-2xl border-2 transition-all ${
                    emoji === em 
                      ? 'border-block-blue bg-white shadow-sm scale-105' 
                      : 'border-transparent bg-gray-100 hover:bg-gray-200 grayscale opacity-60 hover:opacity-100 hover:grayscale-0'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-500 mb-4">Intensity (1-10)</label>
            <input 
              type="range" 
              min="1" max="10" 
              value={intensity} 
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full accent-block-navy h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
            />
            <div className="text-center mt-3 font-bold text-lg text-block-navy">{intensity}</div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-500 mb-2">Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)}
              required
              className="form-input-clean"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-500 mb-2">Notes</label>
            <textarea 
              placeholder="Reflect on your day..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="form-input-clean min-h-[120px] resize-y"
            />
          </div>

          <div className="flex gap-4 pt-6 border-t border-gray-200">
            {existingEntry && (
              <button 
                type="button" 
                onClick={() => { onDelete(existingEntry.date); onClose(); }}
                className="px-5 py-2 text-red-500 font-bold hover:bg-red-50 rounded-full transition-colors"
              >
                Delete
              </button>
            )}
            <div className="flex-1"></div>
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-secondary text-sm px-6"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary text-sm px-8"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MoodEntryModal;

==================================================
FILE: frontend/html_frontend/src/components/MoodSelector.jsx
===========================

import React from 'react';

const emojis = [
  { icon: '🙂', label: 'good' },
  { icon: '😐', label: 'neutral' },
  { icon: '😞', label: 'sad' },
  { icon: '😫', label: 'overwhelmed' },
  { icon: '😶', label: 'unsure' }
];

const MoodSelector = ({ selectedMood, onSelect }) => {
  return (
    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.75rem', fontWeight: '500', color: 'var(--text-main)', marginBottom: '1.5rem' }}>
        How are you feeling right now?
      </h2>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {emojis.map(({ icon, label }) => {
          const isSelected = selectedMood === label;
          return (
            <button
              key={label}
              onClick={() => onSelect(label, icon)}
              style={{
                fontSize: '3rem',
                lineHeight: 1,
                padding: '1rem',
                borderRadius: '24px',
                backgroundColor: isSelected ? 'var(--primary-color)' : 'var(--card-bg)',
                color: isSelected ? 'white' : 'inherit',
                border: isSelected ? '2px solid var(--primary-color)' : '2px solid transparent',
                boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }
              }}
            >
              {icon}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MoodSelector;

==================================================
FILE: frontend/html_frontend/src/components/MoodSummaryCard.jsx
===========================

import React from 'react';

const MoodSummaryCard = ({ title, value, subtitle }) => {
  return (
    <div className="animate-fade-in" style={{
      backgroundColor: 'var(--card-bg)',
      borderRadius: 'var(--border-radius)',
      padding: '2rem',
      boxShadow: 'var(--shadow-md)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      height: '100%'
    }}>
      <h4 style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '1rem', fontWeight: '500' }}>
        {title}
      </h4>
      <div style={{
        fontSize: '2.5rem',
        fontWeight: 'bold',
        color: 'var(--primary-color)',
        marginBottom: '0.5rem'
      }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
};

export default MoodSummaryCard;

==================================================
FILE: frontend/html_frontend/src/components/Navbar.jsx
===========================

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, Calendar, Heart, Home, Mic, MessageSquare, Activity } from 'lucide-react';

const Navbar = () => {
  const location = useLocation();

  const navItem = (path, icon, label) => {
    const isActive = location.pathname === path;
    return (
      <Link 
        to={path} 
        className={`px-3 py-2 flex items-center gap-2 rounded-md transition-colors text-sm font-medium ${
          isActive 
            ? 'bg-slate-100 text-slate-900' 
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
        }`}
      >
        {icon}
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-800 rounded-md flex items-center justify-center text-white font-bold">
              M
            </div>
            <span className="text-lg font-semibold text-slate-800 tracking-tight hidden sm:block">
              MoodMirror
            </span>
          </Link>
          
          <div className="hidden md:flex items-center gap-1">
            {navItem('/dashboard', <Home size={16} />, 'Home')}
            {navItem('/text', <MessageSquare size={16} />, 'Text')}
            {navItem('/audio', <Mic size={16} />, 'Audio')}
            {navItem('/mood', <Calendar size={16} />, 'Calendar')}
            {navItem('/history', <Activity size={16} />, 'History')}
            {navItem('/wellness', <Heart size={16} />, 'Wellness')}
            {navItem('/profile', <User size={16} />, 'Profile')}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

==================================================
FILE: frontend/html_frontend/src/components/OptionalInput.jsx
===========================

import React from 'react';
import { Mic } from 'lucide-react';

const OptionalInput = () => {
  return (
    <div className="animate-fade-in" style={{
      marginBottom: '2.5rem',
      backgroundColor: 'var(--card-bg)',
      padding: '2rem',
      borderRadius: 'var(--border-radius)',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <textarea 
        className="form-textarea"
        placeholder="Want to share anything? (optional)"
        style={{
          minHeight: '120px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          marginBottom: '1rem',
          fontSize: '1rem',
          resize: 'vertical'
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          fontSize: '0.9rem',
          borderRadius: '20px'
        }}>
          <Mic size={16} /> Record Audio
        </button>
      </div>
    </div>
  );
};

export default OptionalInput;

==================================================
FILE: frontend/html_frontend/src/components/ResponseBox.jsx
===========================

import React from 'react';

const ResponseBox = ({ mood }) => {
  if (!mood) return null;

  const responses = {
    'good': 'Glad today feels okay.',
    'neutral': 'Thanks for checking in.',
    'sad': 'That sounds a bit heavy.',
    'overwhelmed': 'That seems really tough.',
    'unsure': 'It’s okay to feel unsure.'
  };

  return (
    <div className="animate-fade-in" style={{
      textAlign: 'center',
      marginBottom: '2rem',
      padding: '1.5rem',
      backgroundColor: '#f8fafc',
      borderRadius: 'var(--border-radius)',
      color: 'var(--text-main)',
      fontSize: '1.25rem',
      fontWeight: '500',
      border: '1px solid #e2e8f0'
    }}>
      {responses[mood] || 'Thanks for sharing.'}
    </div>
  );
};

export default ResponseBox;

==================================================
FILE: frontend/html_frontend/src/components/Result.jsx
===========================

import React from 'react';
import { Link } from 'react-router-dom';

const Result = ({ message, severity, score, disclaimer, type }) => {
  return (
    <div className="clean-card p-12 text-center max-w-2xl mx-auto bg-white border border-gray-200 shadow-sm">
      <h2 className="text-3xl font-bold text-block-navy mb-8">Reflection Complete</h2>
      
      <div className="bg-block-bg p-8 rounded-[24px] mb-8 border border-gray-200 shadow-sm">
        <div className="text-6xl font-bold text-block-navy mb-4">
          {score}<span className="text-2xl text-gray-400 font-medium">/24</span>
        </div>
        <div className="text-sm font-bold text-block-pink uppercase tracking-widest mb-6">
          {severity} Indication
        </div>
        <p className="text-block-navy font-bold leading-relaxed text-lg">
          "{message}"
        </p>
      </div>

      <div className="bg-block-yellow/40 p-6 rounded-2xl mb-10 text-sm text-block-navy text-left flex gap-4 border-none">
        <span className="font-bold text-block-navy text-base">Note:</span>
        <p className="font-medium text-base leading-relaxed text-block-navy/80">{disclaimer}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link to="/dashboard" className="btn-secondary font-bold text-lg py-3 px-8">
          Back to Dashboard
        </Link>
        {type === 'text' ? (
          <Link to="/audio" className="btn-primary font-bold text-lg py-3 px-8">
            Try Audio Check-in
          </Link>
        ) : (
          <Link to="/text" className="btn-primary font-bold text-lg py-3 px-8">
            Try Text Check-in
          </Link>
        )}
      </div>
    </div>
  );
};

export default Result;

==================================================
FILE: frontend/html_frontend/src/components/ScoreChart.jsx
===========================

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ScoreChart = ({ data }) => {
  if (!data || data.length === 0) return null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-block-navy/95 backdrop-blur-md p-4 rounded-xl shadow-lg border border-white/10">
          <p className="font-bold text-white mb-1">{label}</p>
          <p className="text-white font-bold text-base">Score: <span className="font-black text-block-pink">{payload[0].value}</span><span className="text-gray-400 text-sm font-medium">/24</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="clean-card p-8 h-[400px] w-full bg-white border border-gray-200">
      <h3 className="mb-6 text-sm font-bold text-gray-400 tracking-wider uppercase">PHQ-8 Score Trend</h3>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis 
            dataKey="date" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6b7280', fontSize: 13, fontWeight: 'bold' }}
            dy={10}
          />
          <YAxis 
            domain={[0, 24]} 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6b7280', fontSize: 13, fontWeight: 'bold' }}
            dx={-10}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line 
            type="monotone" 
            dataKey="score" 
            stroke="#0A3323" 
            strokeWidth={4}
            dot={{ r: 6, strokeWidth: 3, fill: '#fff', stroke: '#0A3323' }}
            activeDot={{ r: 8, fill: '#D3968C', stroke: '#fff', strokeWidth: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ScoreChart;

==================================================
FILE: frontend/html_frontend/src/components/Sidebar.jsx
===========================

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Mic, Calendar, Activity, Heart, User, HelpCircle } from 'lucide-react';

const Sidebar = () => {
  const location = useLocation();
  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('user@example.com');

  const loadUserData = async () => {
    try {
      const token = localStorage.getItem('jwt_token');
      if (!token) return;
      const response = await fetch('https://140.245.251.56.sslip.io/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUserName(data.name || data.email?.split('@')[0] || 'User');
        setUserEmail(data.email || 'user@example.com');
      }
    } catch (err) {
      console.error('Failed to load user data', err);
    }
  };

  useEffect(() => {
    loadUserData();
    window.addEventListener('storage', loadUserData);
    return () => window.removeEventListener('storage', loadUserData);
  }, []);

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/text', label: 'Text Check-in', icon: <MessageSquare size={20} /> },
    { path: '/audio', label: 'Audio Check-in', icon: <Mic size={20} /> },
    { path: '/mood', label: 'Mood Tracker', icon: <Calendar size={20} /> },
    { path: '/history', label: 'History', icon: <Activity size={20} /> },
    { path: '/wellness', label: 'Wellness Resources', icon: <Heart size={20} /> },
    { path: '/profile', label: 'Profile', icon: <User size={20} /> },
    { path: '/help', label: 'Help', icon: <HelpCircle size={20} /> },
  ];

  return (
    <aside className="fixed top-0 left-0 h-screen w-64 bg-[#0A3323] flex flex-col z-40 transition-colors duration-300">
      <div className="h-20 flex items-center px-6 border-b border-white/10">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#0A3323] font-bold mr-4 shadow-sm">
          M
        </div>
        <span className="text-xl font-bold text-white tracking-tight">MoodMirror</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-8 px-5 flex flex-col gap-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                isActive 
                  ? 'bg-[#D3968C] text-[#0A3323] shadow-sm' 
                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className={isActive ? 'text-[#0A3323]' : 'text-gray-400'}>
                {item.icon}
              </div>
              {item.label}
            </Link>
          );
        })}
      </nav>
      
      <div className="p-5 border-t border-white/10">
        <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/10 border border-white/5">
          <div className="w-10 h-10 rounded-full bg-[#839958] flex items-center justify-center text-[#0A3323] font-bold text-sm uppercase">
            {userName.charAt(0)}
          </div>
          <div className="overflow-hidden">
            <div className="text-sm font-bold text-white truncate">
              {userName}
            </div>
            <div className="text-xs text-gray-300 truncate">
              {userEmail}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

==================================================
FILE: frontend/html_frontend/src/components/Suggestions.jsx
===========================

import React from 'react';

const Suggestions = ({ mood }) => {
  if (!mood) return null;

  let actions = [];

  if (mood === 'sad' || mood === 'overwhelmed') {
    actions = [
      'Try a 30-sec breathing exercise',
      'Do a tiny task',
      'Just vent'
    ];
  } else if (mood === 'good' || mood === 'neutral') {
    actions = [
      'Reflect on what went well'
    ];
  } else if (mood === 'unsure') {
    actions = [
      'Take a 5-minute break',
      'Listen to calming music'
    ];
  }

  if (actions.length === 0) return null;

  return (
    <div className="animate-fade-in" style={{ marginBottom: '3rem' }}>
      <h3 style={{ 
        textAlign: 'center', 
        fontSize: '1.1rem', 
        color: 'var(--text-muted)',
        fontWeight: '500',
        marginBottom: '1rem' 
      }}>
        Gentle suggestions
      </h3>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {actions.map((action, idx) => (
          <button key={idx} className="btn" style={{
            backgroundColor: 'var(--card-bg)',
            color: 'var(--primary-color)',
            border: '1px solid var(--primary-color)',
            boxShadow: 'var(--shadow-sm)',
            borderRadius: '24px',
            padding: '0.75rem 1.5rem',
            fontSize: '0.95rem',
            fontWeight: '500'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--primary-color)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--card-bg)';
            e.currentTarget.style.color = 'var(--primary-color)';
          }}>
            {action}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Suggestions;

