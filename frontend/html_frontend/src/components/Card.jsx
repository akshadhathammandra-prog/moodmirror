import React from 'react';
import { Link } from 'react-router-dom';

const Card = ({ title, description, buttonText, linkTo, icon: Icon }) => {
  return (
    <div className="card animate-fade-in" style={{
      backgroundColor: 'var(--card-bg)',
      borderRadius: 'var(--border-radius)',
      padding: '2rem',
      boxShadow: 'var(--shadow-md)',
      transition: 'var(--transition)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      height: '100%'
    }}>
      {Icon && (
        <div style={{
          backgroundColor: 'var(--secondary-color)',
          color: 'var(--text-main)',
          padding: '1rem',
          borderRadius: '50%',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Icon size={32} />
        </div>
      )}
      <h3 style={{ marginBottom: '0.5rem' }}>{title}</h3>
      <p style={{ flexGrow: 1, marginBottom: '1.5rem' }}>{description}</p>
      <Link to={linkTo} className="btn btn-primary btn-block">
        {buttonText}
      </Link>
    </div>
  );
};

export default Card;
