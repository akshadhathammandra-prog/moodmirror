import React from 'react';
import { Mic } from 'lucide-react';

const OptionalInput = () => {
  return (
    <div className="animate-fade-in" style={{
      marginBottom: '2.5rem',
      backgroundColor: 'var(--card-bg)',
      padding: '2rem',
      borderRadius: 'var(--border-radius)',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <textarea 
        className="form-textarea"
        placeholder="Want to share anything? (optional)"
        style={{
          minHeight: '120px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          marginBottom: '1rem',
          fontSize: '1rem',
          resize: 'vertical'
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          fontSize: '0.9rem',
          borderRadius: '20px'
        }}>
          <Mic size={16} /> Record Audio
        </button>
      </div>
    </div>
  );
};

export default OptionalInput;
