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