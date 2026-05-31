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
