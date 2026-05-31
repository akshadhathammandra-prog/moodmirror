import React from 'react';

const ResponseBox = ({ mood }) => {
  if (!mood) return null;

  const responses = {
    'good': 'Glad today feels okay.',
    'neutral': 'Thanks for checking in.',
    'sad': 'That sounds a bit heavy.',
    'overwhelmed': 'That seems really tough.',
    'unsure': 'It’s okay to feel unsure.'
  };

  return (
    <div className="animate-fade-in" style={{
      textAlign: 'center',
      marginBottom: '2rem',
      padding: '1.5rem',
      backgroundColor: '#f8fafc',
      borderRadius: 'var(--border-radius)',
      color: 'var(--text-main)',
      fontSize: '1.25rem',
      fontWeight: '500',
      border: '1px solid #e2e8f0'
    }}>
      {responses[mood] || 'Thanks for sharing.'}
    </div>
  );
};

export default ResponseBox;
