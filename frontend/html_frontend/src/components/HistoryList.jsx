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
