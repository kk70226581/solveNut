// src/App.jsx
import React from 'react';
import { BrowserRouter, HashRouter, Link, Routes, Route } from 'react-router-dom';

import Home from './pages/Home';
import Experts from './pages/Experts';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import AIExpert from './pages/AIExpert';
import ClientChat from './pages/ClientChat';
import ClientDashboard from './pages/ClientDashboard';
import ClientSettings from './pages/ClientSettings';
import ExpertDashboard from './pages/ExpertDashboard';
import Login from './pages/Login';
import SignupClient from './pages/SignupClient';
import SignupExpert from './pages/SignupExpert';
import ProtectedRoute from './components/ProtectedRoute';
import FloatingAssistant from './components/FloatingAssistant';
import GlobalCallNotifier from './components/GlobalCallNotifier';

function PricingComingSoon() {
  return (
    <div className="app-coming-soon">
      <div className="app-coming-soon-card">
        <div className="app-coming-soon-kicker">Pricing</div>
        <h1>Transparent plans are on the way</h1>
        <p>
          We’re finishing a simple pricing view with clear client and expert options.
          Until then, you can browse experts and start from the homepage.
        </p>
        <div className="app-coming-soon-actions">
          <Link className="app-coming-soon-link" to="/experts">
            Browse experts
          </Link>
          <Link className="app-coming-soon-link app-coming-soon-link--ghost" to="/">
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}

function App() {
  // HashRouter in production prevents refresh 404 on hosts without SPA rewrites.
  const Router = import.meta.env.PROD ? HashRouter : BrowserRouter;

  return (
    <Router>
      <Routes>
        {/* public */}
        <Route path="/" element={<Home />} />
        <Route path="/experts" element={<Experts />} />
        <Route path="/ai-expert" element={<AIExpert />} />

        {/* auth */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup-client" element={<SignupClient />} />
        <Route path="/signup-expert" element={<SignupExpert />} />

        {/* client side */}
        <Route element={<ProtectedRoute allowedRoles={['client']} redirectTo="/login" />}>
          <Route path="/client-dashboard" element={<ClientDashboard />} />
          <Route path="/settings" element={<ClientSettings />} />
          <Route path="/chat" element={<ClientChat />} />
        </Route>

        {/* expert side */}
        <Route element={<ProtectedRoute allowedRoles={['expert']} redirectTo="/login" />}>
          <Route path="/expert-dashboard" element={<ExpertDashboard />} />
        </Route>

        {/* admin */}
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route
          element={
            <ProtectedRoute
              tokenKey="adminSessionToken"
              roleKey={null}
              redirectTo="/admin-login"
            />
          }
        >
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
        </Route>

        <Route path="/pricing" element={<PricingComingSoon />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <GlobalCallNotifier />
      <FloatingAssistant />
    </Router>
  );
}

export default App;
