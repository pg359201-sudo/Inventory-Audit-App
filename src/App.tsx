import React, { useState } from 'react';
import Login from './components/Login';
import AuditorDashboard from './components/AuditorDashboard';
import AdminDashboard from './components/AdminDashboard';
import ErrorBoundary from './components/ErrorBoundary';

type View = 'login' | 'auditor' | 'admin';

export default function App() {
  const [view, setView] = useState<View>('login');

  const handleLogin = (role: 'auditor' | 'admin') => {
    setView(role);
  };

  const handleLogout = () => {
    setView('login');
  };

  return (
    <ErrorBoundary>
      <div>
        {view === 'login' && <Login onLogin={handleLogin} />}
        {view === 'auditor' && <AuditorDashboard onLogout={handleLogout} />}
        {view === 'admin' && <AdminDashboard onLogout={handleLogout} />}
      </div>
    </ErrorBoundary>
  );
}
