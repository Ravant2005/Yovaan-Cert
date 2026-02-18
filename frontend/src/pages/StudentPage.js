import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getStudentHistory } from "../utils/api";

export default function StudentPage() {
  const [searchParams] = useSearchParams();
  const [address, setAddress] = useState(searchParams.get("address") || "");
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!address.trim()) return;
    setError("");
    setData(null);
    setLoading(true);
    try {
      const res = await getStudentHistory(address.trim());
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="verify-wrapper">
      <div className="verify-header">
        <span className="logo-icon">👤</span>
        <h1>Credential History</h1>
        <p>View all certificates linked to a wallet address</p>
      </div>

      <div className="verify-card">
        <form onSubmit={handleSearch}>
          <div className="input-row">
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="0x... (Ethereum wallet address)"
              className="verify-input mono"
              required
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </form>

        {error && <div className="alert alert-error">{error}</div>}

        {data && (
          <div className="student-results">
            <div className="student-header">
              <code className="wallet-address">{data.address}</code>
              <span className="cert-count">{data.total} credential{data.total !== 1 ? "s" : ""}</span>
            </div>

            {data.certs.length === 0 ? (
              <div className="empty-state">No certificates found for this wallet</div>
            ) : (
              <div className="cert-cards">
                {data.certs.map(cert => (
                  <div key={cert.certId} className={`cert-card ${cert.revoked ? "cert-card-revoked" : ""}`}>
                    <div className="cert-card-header">
                      <span className="cert-course">{cert.courseName}</span>
                      <span className={`badge ${cert.revoked ? "badge-revoked" : "badge-active"}`}>
                        {cert.revoked ? "REVOKED" : "ACTIVE"}
                      </span>
                    </div>
                    <div className="cert-card-body">
                      <p><strong>Student:</strong> {cert.studentName}</p>
                      <p><strong>Grade:</strong> {cert.grade}</p>
                      <p><strong>Issued:</strong> {cert.issueDate}</p>
                      <p><strong>Org:</strong> {cert.organizationName}</p>
                      <code className="cert-id">{cert.certId}</code>
                    </div>
                    <div className="cert-card-actions">
                      <a href={`/verify?certId=${cert.certId}`} className="btn btn-sm btn-outline">
                        Verify →
                      </a>
                      <a href={cert.ipfsUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline">
                        IPFS PDF
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="verify-footer">
        <a href="/verify">← Verification Portal</a>
      </div>
    </div>
  );
}
