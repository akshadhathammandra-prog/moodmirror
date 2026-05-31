import React, { useState, useEffect } from 'react';

const Profile = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('jwt_token');
        const response = await fetch('http://140.245.251.56/api/user/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setName(data.name || data.email.split('@')[0]);
          setEmail(data.email || '');
        }
      } catch (err) {
        console.error('Failed to fetch profile', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('jwt_token');
      const response = await fetch('http://140.245.251.56/api/user/profile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ name })
      });
      if (response.ok) {
        alert('Changes saved successfully.');
        window.dispatchEvent(new Event('storage'));
      } else {
        alert('Failed to save changes.');
      }
    } catch (err) {
      alert('An error occurred.');
    }
  };

  if (isLoading) return <div className="max-w-2xl mx-auto opacity-50">Loading profile...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-block-navy mb-2">Your Profile</h2>
        <p className="text-base font-medium text-gray-500">Update your account information and security settings.</p>
      </div>

      <form onSubmit={handleSave}>
        <div className="clean-card p-8 mb-8 bg-white border border-gray-200">
          <h3 className="text-lg font-bold text-block-navy mb-5 border-b border-gray-100 pb-3">Personal Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Full Name</label>
              <input 
                type="text" 
                className="form-input-clean text-sm" 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Email Address</label>
              <input 
                type="email" 
                className="form-input-clean text-sm" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="clean-card p-8 mb-8 bg-white border border-gray-200">
          <h3 className="text-lg font-bold text-block-navy mb-5 border-b border-gray-100 pb-3">Security</h3>
          
          <div className="space-y-6">
            <div className="max-w-sm">
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Current Password</label>
              <input type="password" placeholder="••••••••" className="form-input-clean text-sm" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">New Password</label>
                <input type="password" placeholder="Create new password" className="form-input-clean text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Confirm Password</label>
                <input type="password" placeholder="Confirm new password" className="form-input-clean text-sm" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="submit" className="btn-primary text-base px-8 py-3">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};

export default Profile;
