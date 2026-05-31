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
       "http://140.245.251.56/predict-audio",
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
