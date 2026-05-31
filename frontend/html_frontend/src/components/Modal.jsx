import React from 'react';

const Modal = ({ isOpen, onClose, children, title }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(243, 232, 255, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div className="animate-fade-in card" style={{
        width: '100%',
        maxWidth: '500px',
        padding: '2.5rem',
        position: 'relative',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        {title && <h3 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>{title}</h3>}
        {children}
      </div>
    </div>
  );
};

export default Modal;
