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