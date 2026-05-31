import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Bell, Sparkles, X, Heart, LogOut } from 'lucide-react';

const Header = () => {
  const location = useLocation();
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [notifications, setNotifications] = React.useState([]);
  const [activePopover, setActivePopover] = React.useState(null);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard': return 'Dashboard';
      case '/text': return 'Text Check-in';
      case '/audio': return 'Audio Check-in';
      case '/mood': return 'Mood Tracker';
      case '/history': return 'History';
      case '/wellness': return 'Wellness Resources';
      case '/profile': return 'Profile';
      case '/help': return 'Help';
      default: return 'MoodMirror';
    }
  };

  const refreshNotifications = React.useCallback(async (isProactive = false) => {
    try {
      const token = localStorage.getItem('jwt_token');
      if (!token) return;

      const [moodsRes, notifsRes] = await Promise.all([
        fetch('https://140.245.251.56.sslip.io/api/moods', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('https://140.245.251.56.sslip.io/api/notifications', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const entries = await moodsRes.json();
      const readIds = await notifsRes.json();
      const list = [];

      const dateKeys = Object.keys(entries).sort((a, b) => new Date(b) - new Date(a));

      if (!dateKeys || dateKeys.length === 0) {
        setNotifications([]);
        return;
      }
      
      const lastEntry = entries[dateKeys[0]];
      const todayStr = new Date().toISOString().split('T')[0];
      const entryDate = dateKeys[0];
      const isToday = entryDate === todayStr;

      const emoji = lastEntry.emoji || '🙂';
      const suggestionId = `suggestion-${entryDate}-${emoji}`;
      const isSadMood = emoji === '😞' || emoji === '😫';
      const isGoodMood = emoji === '🙂';
      
      if (isToday || !readIds.includes(suggestionId)) {
        if (isSadMood) {
          const suggestion = {
            id: suggestionId,
            type: 'suggestion',
            icon: <Sparkles size={16} className="text-block-blue" />,
            title: 'Smart Suggestion',
            text: 'Feeling a bit heavy? Try a 2-minute "Deep Calm" session.',
            link: '/wellness',
            time: isToday ? 'Current Mood' : 'Just now'
          };
          list.push(suggestion);
          
          if (isProactive) {
            setActivePopover(suggestion);
            setTimeout(() => setActivePopover(null), 10000);
          }
        } else if (isGoodMood) {
          list.push({
            id: suggestionId,
            type: 'suggestion',
            icon: <Heart size={16} className="text-block-pink" />,
            title: 'Positivity Tip',
            text: 'You are in a great headspace. Spread the positivity! ✨',
            time: isToday ? 'Current Mood' : 'Just now'
          });
        }
      }
      setNotifications(list);
    } catch (e) { 
      console.error('Failed to load notifications', e);
    }
  }, []);

  const updateReadNotifications = async (newIds) => {
    try {
      const token = localStorage.getItem('jwt_token');
      await fetch('https://140.245.251.56.sslip.io/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ read_notifications: newIds })
      });
    } catch (e) { console.error('Failed to update read notifications', e); }
  };

  const markAllAsRead = async () => {
    const currentIds = notifications.map(n => n.id);
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch('https://140.245.251.56.sslip.io/api/notifications', { headers: { 'Authorization': `Bearer ${token}` } });
      const existingRead = await res.json();
      const updatedRead = [...new Set([...existingRead, ...currentIds])];
      await updateReadNotifications(updatedRead);
      setNotifications([]);
    } catch (e) {}
  };

  const markSingleAsRead = async (id) => {
    try {
      const token = localStorage.getItem('jwt_token');
      const res = await fetch('https://140.245.251.56.sslip.io/api/notifications', { headers: { 'Authorization': `Bearer ${token}` } });
      const existingRead = await res.json();
      if (!existingRead.includes(id)) {
        await updateReadNotifications([...existingRead, id]);
      }
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e) {}
  };

  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_email');
    navigate('/');
  };

  React.useEffect(() => {
    refreshNotifications();
    const handleUpdate = () => {
      // Clear proactive popover first to re-trigger animation if already showing
      setActivePopover(null);
      setTimeout(() => refreshNotifications(true), 50);
    };
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('moodUpdate', handleUpdate);
    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('moodUpdate', handleUpdate);
    };
  }, [refreshNotifications, location.pathname]);

  return (
    <header className="h-20 bg-block-bg/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-8 sticky top-0 z-30 transition-colors duration-300">
      <h1 className="text-2xl font-bold text-block-navy">{getPageTitle()}</h1>
      
      <div className="flex items-center gap-5">
        <div className="relative">
          {activePopover && (
            <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 w-64 bg-block-navy text-white p-4 rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-start gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <Sparkles size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">New Suggestion</p>
                  <p className="text-sm font-bold leading-snug">{activePopover.text}</p>
                  <Link to="/wellness" onClick={() => setActivePopover(null)} className="text-xs font-bold text-block-pink mt-2 inline-block hover:underline">
                    Start Exercise →
                  </Link>
                </div>
                <button onClick={() => setActivePopover(null)} className="text-white/40 hover:text-white">
                  <X size={14} />
                </button>
              </div>
              <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 bg-block-navy rotate-45"></div>
            </div>
          )}

          <button 
            onClick={() => {
              setShowNotifications(!showNotifications);
              setActivePopover(null);
            }}
            className={`relative p-2.5 text-gray-500 hover:text-block-navy hover:bg-white rounded-full transition-all shadow-sm bg-white border border-gray-200 ${activePopover ? 'animate-bounce ring-2 ring-block-navy scale-110' : ''}`}
          >
            <Bell size={20} />
            {notifications.length > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-block-pink rounded-full border-2 border-white"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                <span className="text-sm font-bold text-block-navy uppercase tracking-wider">Smart Suggestions</span>
                <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-block-navy">
                  <X size={16} />
                </button>
              </div>
              
              <div className="max-h-[350px] overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div key={n.id} className="px-5 py-4 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 relative group">
                      <button 
                        onClick={() => markSingleAsRead(n.id)}
                        className="absolute top-4 right-4 text-gray-300 hover:text-block-pink opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={14} />
                      </button>
                      <div className="flex gap-3 pr-4">
                        <div className="mt-1 w-8 h-8 rounded-full bg-block-bg flex items-center justify-center shrink-0">
                          {n.icon}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-block-navy mb-0.5">{n.title}</p>
                          <p className="text-sm font-medium text-gray-500 leading-snug">{n.text}</p>
                          {n.link && (
                            <Link 
                              to={n.link} 
                              onClick={() => setShowNotifications(false)}
                              className="text-xs font-bold text-block-blue mt-2 inline-block hover:underline"
                            >
                              View Wellness Page →
                            </Link>
                          )}
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">{n.time}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-10 text-center">
                    <p className="text-sm font-medium text-gray-400">No new suggestions</p>
                  </div>
                )}
              </div>
              
              <div className="px-5 py-3 text-center border-t border-gray-50">
                <button 
                  onClick={markAllAsRead}
                  className="text-xs font-bold text-block-navy/60 hover:text-block-navy uppercase tracking-widest disabled:opacity-30"
                  disabled={notifications.length === 0}
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={handleLogout}
          className="p-2.5 text-gray-500 hover:text-block-pink hover:bg-white rounded-full transition-all shadow-sm bg-white border border-gray-200 flex items-center gap-2 group"
          title="Logout"
        >
          <LogOut size={20} className="group-hover:translate-x-0.5 transition-transform" />
          <span className="text-sm font-bold pr-1 hidden sm:inline">Logout</span>
        </button>
        </div>
    </header>
  );
};

export default Header;
