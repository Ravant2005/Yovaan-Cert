import React, { useEffect, useState } from "react";
import { listCertificates } from "../utils/api";
import Layout from "../components/Layout";

export default function DashboardPage() {
  const [stats, setStats] = useState({ total: 0, active: 0, revoked: 0, recent: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCertificates({ limit: 5 }).then(res => {
      const certs = res.data.certs;
      setStats({
        total:   res.data.total,
        active:  certs.filter(c => !c.revoked).length,
        revoked: certs.filter(c =>  c.revoked).length,
        recent:  certs.slice(0, 5),
      });
    }).finally(() => setLoading(false));
  }, []);

  const StatCard = ({ icon, label, value, color }) => (
    <div className="stat-card" style={{ borderTopColor: color }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{loading ? "…" : value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );

  return (
    <Layout title="Dashboard">
      <div className="stats-grid">
        <StatCard icon="📜" label="Total Issued"  value={stats.total}   color="#4f46e5" />
        <StatCard icon="✅" label="Active"         value={stats.active}  color="#16a34a" />
        <StatCard icon="🚫" label="Revoked"        value={stats.revoked} color="#dc2626" />
        <StatCard icon="⛓️" label="Network"        value="Polygon"       color="#8b5cf6" />
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2 className="section-title">Recent Certificates</h2>
        {stats.recent.length === 0 ? (
          <div className="empty-state">
            No certificates yet. <a href="/issue">Issue your first one →</a>
          </div>
        ) : (
          <table className="cert-table">
            <thead>
              <tr><th>Cert ID</th><th>Student</th><th>Course</th><th>Status</th></tr>
            </thead>
            <tbody>
              {stats.recent.map(cert => (
                <tr key={cert.certId}>
                  <td><code>{cert.certId}</code></td>
                  <td>{cert.studentName}</td>
                  <td>{cert.courseName}</td>
                  <td>
                    <span className={`badge ${cert.revoked ? "badge-revoked" : "badge-active"}`}>
                      {cert.revoked ? "REVOKED" : "ACTIVE"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 16 }}>
          <a href="/certs" className="btn btn-outline">View All Certificates →</a>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="action-grid">
        <a href="/issue" className="action-card">
          <span>📜</span>
          <strong>Issue Certificate</strong>
          <small>Upload PDF and mint on-chain</small>
        </a>
        <a href="/verify" className="action-card">
          <span>🔍</span>
          <strong>Verify Certificate</strong>
          <small>Public verification portal</small>
        </a>
        <a href="/tamper" className="action-card">
          <span>🔬</span>
          <strong>Tamper Check</strong>
          <small>Detect modified certificates</small>
        </a>
      </div>
    </Layout>
  );
}
