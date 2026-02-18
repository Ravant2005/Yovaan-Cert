import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage       from "./pages/LoginPage";
import DashboardPage   from "./pages/DashboardPage";
import IssuePage       from "./pages/IssuePage";
import CertListPage    from "./pages/CertListPage";
import VerifyPage      from "./pages/VerifyPage";
import StudentPage     from "./pages/StudentPage";
import TamperPage      from "./pages/TamperPage";

function PrivateRoute({ children }) {
  return localStorage.getItem("token") ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login"   element={<LoginPage />} />
        <Route path="/verify"  element={<VerifyPage />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/tamper"  element={<TamperPage />} />

        {/* Protected Issuer Portal */}
        <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/issue"  element={<PrivateRoute><IssuePage /></PrivateRoute>} />
        <Route path="/certs"  element={<PrivateRoute><CertListPage /></PrivateRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
