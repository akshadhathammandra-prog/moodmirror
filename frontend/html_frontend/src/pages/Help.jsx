import React from 'react';
import Navbar from '../components/Navbar';
import { BookOpen, Shield, HelpCircle } from 'lucide-react';

const Help = () => {
  return (
    <div>
      <Navbar />
      <div className="container" style={{ marginTop: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2.5rem' }}>How can we help?</h2>
          <p style={{ fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
            Learn how to use MoodMirror and understand your mental health better.
          </p>
        </div>

        <div className="grid grid-cols-2" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="animate-fade-in" style={{
            backgroundColor: 'var(--card-bg)',
            padding: '2rem',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <BookOpen size={32} color="var(--primary-color)" style={{ marginBottom: '1rem' }} />
            <h3>Using the App</h3>
            <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>
              <li style={{ marginBottom: '0.5rem' }}>Choose between Text or Audio check-ins on the Dashboard.</li>
              <li style={{ marginBottom: '0.5rem' }}>Express your feelings honestly and openly.</li>
              <li style={{ marginBottom: '0.5rem' }}>Review your generated PHQ-8 score and insights.</li>
              <li>Track your progress over time in the Mood Tracker.</li>
            </ul>
          </div>

          <div className="animate-fade-in" style={{
            backgroundColor: 'var(--card-bg)',
            padding: '2rem',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <Shield size={32} color="var(--primary-color)" style={{ marginBottom: '1rem' }} />
            <h3>Privacy & Security</h3>
            <p>
              Your mental health data is strictly confidential. We do not share your text or audio entries with any third parties. All analyses are performed securely, and audio files are never stored permanently on our servers.
            </p>
          </div>
          
          <div className="animate-fade-in" style={{
            backgroundColor: 'var(--card-bg)',
            padding: '2rem',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-sm)',
            gridColumn: '1 / -1'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <HelpCircle size={32} color="var(--primary-color)" />
              <h3 style={{ margin: 0 }}>Crisis Resources</h3>
            </div>
            <p>
              MoodMirror is not a diagnostic tool or a substitute for professional help. 
              If you or someone you know is going through a tough time, please reach out for immediate support:
            </p>
            <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem' }}>
              <div style={{ backgroundColor: '#fff5f5', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #fc8181', flex: 1 }}>
                <strong>National Suicide Prevention Lifeline:</strong><br/>
                <span style={{ fontSize: '1.25rem', color: '#c53030', fontWeight: 'bold' }}>988</span>
              </div>
              <div style={{ backgroundColor: '#f0f4f8', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid var(--primary-color)', flex: 1 }}>
                <strong>Crisis Text Line:</strong><br/>
                Text HOME to <span style={{ fontWeight: 'bold' }}>741741</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;
