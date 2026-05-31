import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Result from '../components/Result';

const TextCheckIn = () => {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('jwt_token');
      const response = await fetch("http://140.245.251.56/predict-text",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },

        body: JSON.stringify({
        text: text,
        }),
      }
      );
      
      if (response.status === 401) {
        localStorage.removeItem('jwt_token');
        navigate('/signin');
        return;
      }

      const data = await response.json();

      const analysisResult = {
        message: "Your text has been analyzed successfully.",
        severity: data.severity,
        score: data.score,
        disclaimer:
          "This analysis is for informational purposes only and is not a substitute for professional medical advice.",
      };

      // The backend automatically saves the prediction to MongoDB now.
      // We no longer need to manually append to localStorage.

      setResult(analysisResult);

      setIsSubmitting(false);
    } catch (error) {
      console.error('Error analyzing text:', error);
      setIsSubmitting(false);
    }
  };

  if (result) {
    return <Result {...result} type="text" />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-block-navy mb-2">Text Check-in</h2>
        <p className="text-base font-medium text-gray-500">Write freely about your day or how you are feeling.</p>
      </div>

      <div className="clean-card p-10 bg-block-navy border-none shadow-xl">
        <form onSubmit={handleSubmit}>
          <div className="mb-8">
            <textarea
              className="form-input-clean w-full resize-y text-lg p-8 bg-white border-4 border-transparent focus:border-block-blue focus:ring-0 shadow-inner rounded-3xl"
              style={{ minHeight: '350px' }}
              placeholder="How are you really feeling today? Write it down here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              className="bg-white/10 border-2 border-white/30 text-white font-bold rounded-full px-8 py-3 transition-all duration-200 hover:bg-white/20 shadow-sm"
              onClick={() => setText('')}
              disabled={isSubmitting || !text}
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !text.trim()}
              className="bg-white text-block-navy font-bold px-12 py-3 rounded-full hover:bg-block-blue transition-all shadow-lg transform hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 min-w-[180px]"
            >
              {isSubmitting ? 'Reflecting...' : 'Save Reflection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TextCheckIn;
