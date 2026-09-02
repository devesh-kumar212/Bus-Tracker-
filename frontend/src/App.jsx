import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import AuthPortal from './pages/AuthPortal';
import PassengerDashboard from './pages/PassengerDashboard';
import DriverPortal from './pages/DriverPortal';
import AdminPortal from './pages/AdminPortal';
import DriverRegister from './pages/DriverRegister';
import DriverPending from './pages/DriverPending';
import DriverRejected from './pages/DriverRejected';

import PassengerErrorBoundary from './components/PassengerErrorBoundary';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        
        {/* Authentication Portals */}
        <Route path="/driver-login" element={<AuthPortal />} />
        <Route path="/driver-register" element={<DriverRegister />} />
        <Route path="/passenger-login" element={<AuthPortal />} />
        <Route path="/admin-login" element={<AuthPortal />} />

        {/* Driver Approval Workflow Pages */}
        <Route path="/driver/pending" element={<DriverPending />} />
        <Route path="/driver/rejected" element={<DriverRejected />} />

        {/* Dashboard Workspaces */}
        <Route path="/passenger" element={<PassengerErrorBoundary><PassengerDashboard /></PassengerErrorBoundary>} />
        <Route path="/tracker" element={<PassengerErrorBoundary><PassengerDashboard /></PassengerErrorBoundary>} />
        <Route path="/buses" element={<PassengerErrorBoundary><PassengerDashboard /></PassengerErrorBoundary>} />
        <Route path="/live" element={<PassengerErrorBoundary><PassengerDashboard /></PassengerErrorBoundary>} />
        <Route path="/bus-tracker" element={<PassengerErrorBoundary><PassengerDashboard /></PassengerErrorBoundary>} />
        <Route path="/passenger-dashboard" element={<PassengerErrorBoundary><PassengerDashboard /></PassengerErrorBoundary>} />
        <Route path="/driver/dashboard" element={<DriverPortal />} />
        <Route path="/admin/dashboard" element={<AdminPortal />} />

        {/* Fallback to Landing page */}
        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  );
}
