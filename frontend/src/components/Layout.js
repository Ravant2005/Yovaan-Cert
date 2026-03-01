import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function Layout({ title, children }) {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");

  function logout() {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    navigate("/login");
  }

  const navItems = [
    { to: "/", icon: "📊", label: "Dashboard" },
    { to: "/issue", icon: "📜", label: "Issue Certificate" },
    { to: "/certs", icon: "🗂️", label: "Certificates" },
    { to: "/verify", icon: "🔍", label: "Verify Portal" },
    { to: "/tamper", icon: "🔬", label: "Tamper Check" },
    { to: "/student", icon: "👤", label: "Credential History" },
  ];

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span>⛓️</span>
          <span>CertiChain</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <small>{user.email}</small>
            <span className="role-badge">{user.role}</span>
          </div>
          <button onClick={logout} className="logout-btn">Sign Out</button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        <header className="page-header">
          <h1>{title}</h1>
        </header>
        <div className="page-body">{children}</div>
      </main>
    </div>
  );
}
