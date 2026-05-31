import React from 'react';

const emojis = [
  { icon: '🙂', label: 'good' },
  { icon: '😐', label: 'neutral' },
  { icon: '😞', label: 'sad' },
  { icon: '😫', label: 'overwhelmed' },
  { icon: '😶', label: 'unsure' }
];

const MoodSelector = ({ selectedMood, onSelect }) => {
  return (
    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.75rem', fontWeight: '500', color: 'var(--text-main)', marginBottom: '1.5rem' }}>
        How are you feeling right now?
      </h2>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {emojis.map(({ icon, label }) => {
          const isSelected = selectedMood === label;
          return (
            <button
              key={label}
              onClick={() => onSelect(label, icon)}
              style={{
                fontSize: '3rem',
                lineHeight: 1,
                padding: '1rem',
                borderRadius: '24px',
                backgroundColor: isSelected ? 'var(--primary-color)' : 'var(--card-bg)',
                color: isSelected ? 'white' : 'inherit',
                border: isSelected ? '2px solid var(--primary-color)' : '2px solid transparent',
                boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }
              }}
            >
              {icon}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MoodSelector;
