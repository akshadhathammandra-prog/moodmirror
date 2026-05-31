import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, Calendar, Heart, Home, Mic, MessageSquare, Activity } from 'lucide-react';

const Navbar = () => {
  const location = useLocation();

  const navItem = (path, icon, label) => {
    const isActive = location.pathname === path;
    return (
      <Link 
        to={path} 
        className={`px-3 py-2 flex items-center gap-2 rounded-md transition-colors text-sm font-medium ${
          isActive 
            ? 'bg-slate-100 text-slate-900' 
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
        }`}
      >
        {icon}
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-800 rounded-md flex items-center justify-center text-white font-bold">
              M
            </div>
            <span className="text-lg font-semibold text-slate-800 tracking-tight hidden sm:block">
              MoodMirror
            </span>
          </Link>
          
          <div className="hidden md:flex items-center gap-1">
            {navItem('/dashboard', <Home size={16} />, 'Home')}
            {navItem('/text', <MessageSquare size={16} />, 'Text')}
            {navItem('/audio', <Mic size={16} />, 'Audio')}
            {navItem('/mood', <Calendar size={16} />, 'Calendar')}
            {navItem('/history', <Activity size={16} />, 'History')}
            {navItem('/wellness', <Heart size={16} />, 'Wellness')}
            {navItem('/profile', <User size={16} />, 'Profile')}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
