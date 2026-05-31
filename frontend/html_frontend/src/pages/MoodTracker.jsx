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
        const res = await fetch('http://140.245.251.56/api/moods', {
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
      await fetch('http://140.245.251.56/api/moods', {
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
