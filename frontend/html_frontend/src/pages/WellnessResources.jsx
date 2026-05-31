import React, { useState, useEffect } from 'react';

const tips = [
  { title: "Daily Gratitude", desc: "Write down 3 things you're thankful for today.", bg: "bg-[#efdc87]" },
  { title: "Sleep Schedule", desc: "Try to go to bed and wake up at the same time.", bg: "bg-[#1C7387]" },
  { title: "Stay Active", desc: "Take a 15-minute walk outside to refresh your mind.", bg: "bg-[#839958]" },
  { title: "Mindfulness", desc: "Spend 5 minutes simply noticing your surroundings.", bg: "bg-[#D3968C]" },
  { title: "Connect", desc: "Reach out to a friend or family member just to say hi.", bg: "bg-[#efdc87]" },
  { title: "Limit Screens", desc: "Disconnect from social media an hour before bed.", bg: "bg-[#1C7387]" },
];

const WellnessResources = () => {
  const [breathingMode, setBreathingMode] = useState('box');
  const [isBreathing, setIsBreathing] = useState(false);
  const [phase, setPhase] = useState('Ready?');
  const [scale, setScale] = useState(1);
  const [transitionDuration, setTransitionDuration] = useState('0.5s');

  const [sessionDuration, setSessionDuration] = useState(1);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    let interval;
    if (isBreathing && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => prev - 1);
      }, 1000);
    } else if (isBreathing && timeRemaining <= 0) {
      setIsBreathing(false);
      setIsCompleted(true);
    }
    return () => clearInterval(interval);
  }, [isBreathing, timeRemaining]);

  const toggleBreathing = () => {
    if (!isBreathing) {
      setTimeRemaining(sessionDuration * 60);
      setIsCompleted(false);
      setIsBreathing(true);
    } else {
      setIsBreathing(false);
    }
  };

  useEffect(() => {
    let timeoutId;
    let isActive = true;

    if (!isBreathing) {
      setPhase('Ready?');
      setScale(1);
      setTransitionDuration('0.5s');
      return;
    }

    const runCycle = () => {
      if (!isActive) return;

      if (breathingMode === 'box') {
        setPhase('Inhale... (4s)');
        setScale(1.5);
        setTransitionDuration('4s');
        
        timeoutId = setTimeout(() => {
          if (!isActive) return;
          setPhase('Hold... (4s)');
          
          timeoutId = setTimeout(() => {
            if (!isActive) return;
            setPhase('Exhale... (4s)');
            setScale(1);
            setTransitionDuration('4s');
            
            timeoutId = setTimeout(() => {
              if (!isActive) return;
              setPhase('Hold... (4s)');
              
              timeoutId = setTimeout(runCycle, 4000);
            }, 4000);
          }, 4000);
        }, 4000);
      } else if (breathingMode === '4-7-8') {
        setPhase('Inhale... (4s)');
        setScale(1.5);
        setTransitionDuration('4s');
        
        timeoutId = setTimeout(() => {
          if (!isActive) return;
          setPhase('Hold... (7s)');
          
          timeoutId = setTimeout(() => {
            if (!isActive) return;
            setPhase('Exhale... (8s)');
            setScale(1);
            setTransitionDuration('8s');
            
            timeoutId = setTimeout(runCycle, 8000);
          }, 7000);
        }, 4000);
      } else {
        setPhase('Inhale... (5s)');
        setScale(1.5);
        setTransitionDuration('5s');
        
        timeoutId = setTimeout(() => {
          if (!isActive) return;
          setPhase('Exhale... (5s)');
          setScale(1);
          setTransitionDuration('5s');
          
          timeoutId = setTimeout(runCycle, 5000);
        }, 5000);
      }
    };

    runCycle();

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [isBreathing, breathingMode]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-block-navy mb-2">Wellness Resources</h2>
        <p className="text-base text-gray-500 font-medium">Evidence-based practices and exercises.</p>
      </div>

      {/* Breathing Exercise */}
      <div className="clean-card p-10 text-center mb-10 bg-[#1C7387] border-none">
        <h3 className="text-xl font-bold text-[#0A3323] mb-2">Guided Breathing</h3>
        <p className="text-[#0A3323]/80 font-medium text-base mb-8">Select a technique and follow the pace.</p>

        <div className="flex justify-center gap-3 mb-10">
          {['box', '4-7-8', 'calm'].map((mode) => (
            <button
              key={mode}
              onClick={() => setBreathingMode(mode)}
              className={`px-6 py-2.5 text-sm font-bold rounded-full transition-colors ${breathingMode === mode
                ? 'bg-[#0A3323] text-white shadow-sm'
                : 'bg-white text-[#0A3323] hover:bg-gray-50 border border-transparent'
                }`}
            >
              {mode === 'box' ? 'Box Breathing' : mode === '4-7-8' ? '4-7-8 Technique' : 'Deep Calm'}
            </button>
          ))}
        </div>

        {!isBreathing && (
          <div className="mb-8">
            <p className="text-[#0A3323]/90 font-bold mb-3 text-sm uppercase tracking-wider">Session Duration</p>
            <div className="flex justify-center gap-3">
              {[1, 2, 5, 10].map((min) => (
                <button
                  key={min}
                  onClick={() => setSessionDuration(min)}
                  className={`px-5 py-2 text-sm font-bold rounded-full transition-colors ${
                    sessionDuration === min
                      ? 'bg-[#0A3323] text-white shadow-sm'
                      : 'bg-white text-[#0A3323] hover:bg-gray-50 border border-transparent shadow-sm'
                  }`}
                >
                  {min} min
                </button>
              ))}
            </div>
          </div>
        )}

        {isBreathing && (
          <div className="mb-8">
            <p className="text-5xl font-bold text-[#0A3323]">
              {Math.floor(timeRemaining / 60).toString().padStart(2, '0')}:
              {(timeRemaining % 60).toString().padStart(2, '0')}
            </p>
          </div>
        )}

        {isCompleted && !isBreathing && (
          <div className="mb-8 p-4 bg-[#0A3323]/10 rounded-2xl max-w-sm mx-auto">
            <p className="text-[#0A3323] font-bold text-lg">Session complete. Good job. 🎉</p>
          </div>
        )}

        <div className="h-48 flex items-center justify-center relative mb-8">
          <div
            onClick={toggleBreathing}
            className="w-32 h-32 rounded-full flex items-center justify-center text-[#0A3323] text-base font-bold bg-white transition-all shadow-md cursor-pointer hover:bg-gray-50"
            style={{
              transform: `scale(${scale})`,
              transitionDuration: transitionDuration,
              transitionTimingFunction: 'ease-in-out'
            }}
          >
            {phase}
          </div>
        </div>

        <button
          onClick={toggleBreathing}
          className="bg-[#0A3323] text-white font-bold px-8 py-3 rounded-full hover:bg-[#1C7387] transition-colors shadow-sm"
        >
          {isBreathing ? 'Stop Exercise' : 'Start Breathing'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tips Grid */}
        <div className="lg:col-span-2">
          <h3 className="text-xl font-bold text-[#0A3323] mb-5">Daily Habits</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {tips.map((tip, idx) => (
              <div key={idx} className={`clean-card p-6 ${tip.bg} ${tip.bg.includes('white') ? '' : 'border-none'}`}>
                <h4 className="text-lg font-bold text-[#0A3323] mb-2">{tip.title}</h4>
                <p className={`text-sm font-medium ${tip.bg.includes('white') ? 'text-gray-600' : 'text-[#0A3323]/80'}`}>{tip.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Hotlines */}
        <div className="lg:col-span-1">
          <h3 className="text-xl font-bold text-[#0A3323] mb-5">Support Hotlines</h3>
          <div className="clean-card p-6 bg-[#D3968C] border-none">
            <p className="text-[#0A3323] text-sm mb-5 font-bold">Confidential help is available 24/7.</p>

            <div className="space-y-4">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <strong className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">National Crisis Line</strong>
                <span className="text-2xl font-bold text-[#0A3323]">988</span>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <strong className="block text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Crisis Text Line</strong>
                <span className="text-xl font-bold text-[#0A3323]">Text HOME to 741741</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default WellnessResources;
