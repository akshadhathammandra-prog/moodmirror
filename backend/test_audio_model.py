import subprocess
import imageio_ffmpeg
import numpy as np
import speech_recognition as sr
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from text_predict import predict_text_depression

def decode_audio(filepath):
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
        raise Exception(f"FFMPEG failed: {stderr.decode()}")
    audio = np.frombuffer(stdout, dtype=np.float32)
    return audio, 16000

signal, sr_rate = decode_audio('uploads/blob')
recognizer = sr.Recognizer()
audio_int16 = (signal * 32767).astype(np.int16)
audio_data = sr.AudioData(audio_int16.tobytes(), sr_rate, 2)
try:
    text = recognizer.recognize_google(audio_data)
    print("TRANSCRIBED TEXT:", text)
    result = predict_text_depression(text)
    print("TEXT MODEL RESULT:", result)
except Exception as e:
    print("ERROR:", e)
