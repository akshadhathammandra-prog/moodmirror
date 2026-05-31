import React from 'react';

const Suggestions = ({ mood }) => {
  if (!mood) return null;

  let actions = [];

  if (mood === 'sad' || mood === 'overwhelmed') {
    actions = [
      'Try a 30-sec breathing exercise',
      'Do a tiny task',
      'Just vent'
    ];
  } else if (mood === 'good' || mood === 'neutral') {
    actions = [
      'Reflect on what went well'
    ];
  } else if (mood === 'unsure') {
    actions = [
      'Take a 5-minute break',
      'Listen to calming music'
    ];
  }

  if (actions.length === 0) return null;

  return (
    <div className="animate-fade-in" style={{ marginBottom: '3rem' }}>
      <h3 style={{ 
        textAlign: 'center', 
        fontSize: '1.1rem', 
        color: 'var(--text-muted)',
        fontWeight: '500',
        marginBottom: '1rem' 
      }}>
        Gentle suggestions
      </h3>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {actions.map((action, idx) => (
          <button key={idx} className="btn" style={{
            backgroundColor: 'var(--card-bg)',
            color: 'var(--primary-color)',
            border: '1px solid var(--primary-color)',
            boxShadow: 'var(--shadow-sm)',
            borderRadius: '24px',
            padding: '0.75rem 1.5rem',
            fontSize: '0.95rem',
            fontWeight: '500'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--primary-color)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--card-bg)';
            e.currentTarget.style.color = 'var(--primary-color)';
          }}>
            {action}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Suggestions;
