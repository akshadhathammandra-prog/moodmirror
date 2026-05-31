import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const SignIn = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    
    setError('');
    setSuccessMsg('');
    try {
      const response = await fetch('http://127.0.0.1:5000/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessMsg(data.message || 'If an account exists, a reset link will be sent shortly.');
      } else {
        setError(data.error || 'Failed to request password reset.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);
    
    try {
      const response = await fetch('http://127.0.0.1:5000/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        localStorage.setItem('jwt_token', data.token);
        // Do not store profile data in localStorage
        navigate('/dashboard');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred during login');
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
        <h2 className="text-3xl font-bold tracking-tight text-block-navy">Welcome back</h2>
        <p className="mt-3 text-base font-medium text-gray-500">
          New to MoodMirror?{' '}
          <Link to="/signup" className="font-bold text-block-pink hover:text-block-navy hover:underline transition-colors">
            Create an account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="clean-card py-10 px-4 sm:px-10 bg-white border border-gray-200">
          {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm text-center">{error}</div>}
          {successMsg && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded text-sm text-center">{successMsg}</div>}
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

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-5 w-5 text-block-navy focus:ring-block-navy/30 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm font-bold text-gray-600">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <button type="button" onClick={handleForgotPassword} className="font-bold text-block-pink hover:text-block-navy hover:underline">
                  Forgot password?
                </button>
              </div>
            </div>

            <div className="pt-4">
              <button type="submit" disabled={isLoading} className="btn-primary w-full text-center flex justify-center text-lg py-3.5 disabled:opacity-50">
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
