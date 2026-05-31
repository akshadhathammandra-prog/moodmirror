import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const SignUp = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const response = await fetch('http://140.245.251.56/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        navigate('/signin');
      } else {
        setError(data.error || 'Signup failed');
      }
    } catch (err) {
      setError('An error occurred during signup');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-block-navy flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-block-bg">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="w-20 h-20 bg-block-navy rounded-2xl flex items-center justify-center text-white font-bold text-4xl mx-auto mb-6 shadow-sm">
          M
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-block-navy">Create your account</h2>
        <p className="mt-3 text-base font-medium text-gray-500">
          Already have an account?{' '}
          <Link to="/signin" className="font-bold text-block-pink hover:text-block-navy hover:underline transition-colors">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="clean-card py-10 px-4 sm:px-10 bg-white border border-gray-200">
          {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm text-center">{error}</div>}
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-bold text-block-navy mb-2">
                Email address
              </label>
              <input
                type="email"
                required
                className="form-input-clean shadow-sm text-base p-3"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-block-navy mb-2">
                Password
              </label>
              <input
                type="password"
                required
                className="form-input-clean shadow-sm text-base p-3"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="pt-4">
              <button type="submit" disabled={isLoading} className="btn-primary w-full text-center flex justify-center text-lg py-3.5 disabled:opacity-50">
                {isLoading ? 'Creating...' : 'Create account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
