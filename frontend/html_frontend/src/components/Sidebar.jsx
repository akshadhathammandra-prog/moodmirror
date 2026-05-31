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
