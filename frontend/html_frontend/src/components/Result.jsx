import React from 'react';
import { Link } from 'react-router-dom';

const Result = ({ message, severity, score, disclaimer, type }) => {
  return (
    <div className="clean-card p-12 text-center max-w-2xl mx-auto bg-white border border-gray-200 shadow-sm">
      <h2 className="text-3xl font-bold text-block-navy mb-8">Reflection Complete</h2>
      
      <div className="bg-block-bg p-8 rounded-[24px] mb-8 border border-gray-200 shadow-sm">
        <div className="text-6xl font-bold text-block-navy mb-4">
          {score}<span className="text-2xl text-gray-400 font-medium">/24</span>
        </div>
        <div className="text-sm font-bold text-block-pink uppercase tracking-widest mb-6">
          {severity} Indication
        </div>
        <p className="text-block-navy font-bold leading-relaxed text-lg">
          "{message}"
        </p>
      </div>

      <div className="bg-block-yellow/40 p-6 rounded-2xl mb-10 text-sm text-block-navy text-left flex gap-4 border-none">
        <span className="font-bold text-block-navy text-base">Note:</span>
        <p className="font-medium text-base leading-relaxed text-block-navy/80">{disclaimer}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link to="/dashboard" className="btn-secondary font-bold text-lg py-3 px-8">
          Back to Dashboard
        </Link>
        {type === 'text' ? (
          <Link to="/audio" className="btn-primary font-bold text-lg py-3 px-8">
            Try Audio Check-in
          </Link>
        ) : (
          <Link to="/text" className="btn-primary font-bold text-lg py-3 px-8">
            Try Text Check-in
          </Link>
        )}
      </div>
    </div>
  );
};

export default Result;
