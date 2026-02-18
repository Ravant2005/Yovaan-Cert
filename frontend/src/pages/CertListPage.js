import React, { useState, useEffect } from "react";
import { listCertificates, revokeCertificate } from "../utils/api";
import Layout from "../components/Layout";

export default function CertListPage() {
  const [certs, setCerts]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState("");

  async function fetchCerts() {
    setLoading(true);
    try {
      const res = await listCertificates({ page, search });
      setCerts(res.data.certs);
      setTotal(res.data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCerts(); }, [page, search]);

  async function handleRevoke(certId) {
    if (!window.confirm(`Revoke certificate ${certId}? This action is PERMANENT on the blockchain.`)) return;
    setRevoking(certId);
    try {
      await revokeCertificate(certId);
      fetchCerts(); // refresh
    } catch (err) {
      alert(err.response?.data?.error || "Revocation failed");
    } finally {
      setRevoking("");
    }
  }

  const statusBadge = (cert) => {
    if (cert.revoked) return <span className="badge badge-revoked">🚫 REVOKED</span>;
    return <span className="badge badge-active">✅ ACTIVE</span>;
  };

  return (
    <Layout title="Issued Certificates">
      <div className="card">
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search by student or course…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="search-input"
          />
          <span className="total-count">{total} certificates</span>
        </div>

        {loading ? (
          <div className="loading-state">Loading…</div>
        ) : certs.length === 0 ? (
          <div className="empty-state">No certificates found</div>
        ) : (
          <div className="table-wrapper">
            <table className="cert-table">
              <thead>
                <tr>
                  <th>Cert ID</th>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Issued</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {certs.map(cert => (
                  <tr key={cert.certId} className={cert.revoked ? "row-revoked" : ""}>
                    <td><code>{cert.certId}</code></td>
                    <td>
                      <div>{cert.studentName}</div>
                      <small className="mono">{cert.studentAddress?.slice(0, 10)}…</small>
                    </td>
                    <td>{cert.courseName}</td>
                    <td>{new Date(cert.createdAt).toLocaleDateString()}</td>
                    <td>{statusBadge(cert)}</td>
                    <td>
                      <div className="action-btns">
                        <a
                          href={`/verify?certId=${cert.certId}`}
                          className="btn btn-sm btn-secondary"
                          target="_blank" rel="noreferrer"
                        >
                          View
                        </a>
                        {!cert.revoked && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleRevoke(cert.certId)}
                            disabled={revoking === cert.certId}
                          >
                            {revoking === cert.certId ? "Revoking…" : "Revoke"}
                          </button>
                        )}
                        {cert.qrCodeData && (
                          <a
                            href={cert.qrCodeData}
                            download={`${cert.certId}-QR.png`}
                            className="btn btn-sm btn-outline"
                          >
                            QR
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="pagination">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
          <span>Page {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={certs.length < 20}>Next →</button>
        </div>
      </div>
    </Layout>
  );
}
