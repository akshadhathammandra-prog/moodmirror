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
        const res = await fetch('http://140.245.251.56/api/moods', {
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
