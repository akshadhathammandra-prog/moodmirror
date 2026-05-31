import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenParam = params.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setError('Invalid password reset link. No token found.');
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      setError('Cannot reset password without a valid token.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    
    setError('');
    setSuccessMsg('');
    setIsLoading(true);
    
    try {
      const response = await fetch('https://140.245.251.56.sslip.io/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccessMsg(data.message || 'Password reset successfully! You can now log in.');
        setTimeout(() => {
          navigate('/signin');
        }, 3000);
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch (err) {
      setError('An error occurred. Please try again later.');
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
        <h2 className="text-3xl font-bold tracking-tight text-block-navy">Reset Password</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="clean-card py-10 px-4 sm:px-10 bg-white border border-gray-200">
          {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm text-center">{error}</div>}
          {successMsg && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded text-sm text-center">{successMsg}</div>}
          
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-bold text-block-navy mb-2">
                New Password
              </label>
              <input
                type="password"
                required
                className="form-input-clean shadow-sm text-base p-3"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={!token}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-block-navy mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                className="form-input-clean shadow-sm text-base p-3"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={!token}
              />
            </div>

            <div className="pt-4">
              <button type="submit" disabled={isLoading || !token} className="btn-primary w-full text-center flex justify-center text-lg py-3.5 disabled:opacity-50">
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
            
            <div className="text-center mt-4 text-sm font-bold">
               <Link to="/signin" className="text-block-pink hover:text-block-navy hover:underline transition-colors">
                 Back to login
               </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
