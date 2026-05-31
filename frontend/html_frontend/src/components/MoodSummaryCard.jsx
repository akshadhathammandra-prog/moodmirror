import React from 'react';

const MoodSummaryCard = ({ title, value, subtitle }) => {
  return (
    <div className="animate-fade-in" style={{
      backgroundColor: 'var(--card-bg)',
      borderRadius: 'var(--border-radius)',
      padding: '2rem',
      boxShadow: 'var(--shadow-md)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      height: '100%'
    }}>
      <h4 style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '1rem', fontWeight: '500' }}>
        {title}
      </h4>
      <div style={{
        fontSize: '2.5rem',
        fontWeight: 'bold',
        color: 'var(--primary-color)',
        marginBottom: '0.5rem'
      }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
};

export default MoodSummaryCard;
