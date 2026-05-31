import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AudioCheckIn from './pages/AudioCheckIn';
import MoodTracker from './pages/MoodTracker';
import WellnessResources from './pages/WellnessResources';
import Profile from './pages/Profile';
import TextCheckIn from './pages/TextCheckIn';
import History from './pages/History';
import Help from './pages/Help';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import ResetPassword from './pages/ResetPassword';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('jwt_token');
  if (!token) {
    return <Navigate to="/signin" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/signin" replace />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Authenticated Routes with Layout */}
        <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/text" element={<ProtectedRoute><Layout><TextCheckIn /></Layout></ProtectedRoute>} />
        <Route path="/audio" element={<ProtectedRoute><Layout><AudioCheckIn /></Layout></ProtectedRoute>} />
        <Route path="/mood" element={<ProtectedRoute><Layout><MoodTracker /></Layout></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><Layout><History /></Layout></ProtectedRoute>} />
        <Route path="/wellness" element={<ProtectedRoute><Layout><WellnessResources /></Layout></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
        <Route path="/help" element={<ProtectedRoute><Layout><Help /></Layout></ProtectedRoute>} />
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
