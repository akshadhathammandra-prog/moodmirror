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
          fetch('http://140.245.251.56/api/moods', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('http://140.245.251.56/api/history', { headers: { 'Authorization': `Bearer ${token}` } })
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
