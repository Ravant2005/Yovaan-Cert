import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { verifyCertificate } from "../utils/api";

const TX_EXPLORER_URL = process.env.REACT_APP_TX_EXPLORER_URL || "https://amoy.polygonscan.com/tx";

export default function VerifyPage() {
  const [searchParams] = useSearchParams();
  const [certId, setCertId] = useState(searchParams.get("certId") || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auto-verify if certId comes from URL (QR scan)
  useEffect(() => {
    if (searchParams.get("certId")) handleVerify();
  }, []);

  async function handleVerify(e) {
    if (e) e.preventDefault();
    if (!certId.trim()) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await verifyCertificate(certId.trim());
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  function StatusBanner({ valid, revoked }) {
    if (revoked) return <div className="status-banner status-revoked">🚫 CERTIFICATE REVOKED</div>;
    if (valid) return <div className="status-banner status-valid">✅ CERTIFICATE VALID</div>;
    return <div className="status-banner status-invalid">❌ CERTIFICATE NOT FOUND</div>;
  }

  return (
    <div className="verify-wrapper">
      <div className="verify-header">
        <span className="logo-icon">⛓️</span>
        <h1>CertiChain</h1>
        <p>Decentralized Certificate Verification</p>
      </div>

      <div className="verify-card">
        <form onSubmit={handleVerify}>
          <label>Enter Certificate ID</label>
          <div className="input-row">
            <input
              type="text"
              value={certId}
              onChange={e => setCertId(e.target.value)}
              placeholder="CERT-XXXXXXXX"
              className="verify-input"
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Verifying…" : "🔍 Verify"}
            </button>
          </div>
        </form>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Result */}
        {result && (
          <div className="verify-result">
            <StatusBanner valid={result.valid} revoked={result.revoked} />

            <div className="result-sections">
              {/* Certificate Details */}
              <section className="result-section">
                <h3>Certificate Details</h3>
                <table className="details-table">
                  <tbody>
                    <tr><td>Certificate ID</td><td><code>{result.certId}</code></td></tr>
                    <tr><td>Student Name</td><td>{result.metadata?.studentName}</td></tr>
                    <tr><td>Course</td><td>{result.metadata?.courseName}</td></tr>
                    <tr><td>Grade</td><td>{result.metadata?.grade}</td></tr>
                    <tr><td>Organization</td><td>{result.metadata?.organizationName}</td></tr>
                    <tr><td>Issue Date</td><td>{result.metadata?.issueDate}</td></tr>
                  </tbody>
                </table>
              </section>

              {/* Blockchain Data */}
              <section className="result-section">
                <h3>⛓️ Blockchain Proof</h3>
                <table className="details-table mono-table">
                  <tbody>
                    <tr><td>Issued At</td><td>{new Date(result.chain?.issuedAt).toLocaleString()}</td></tr>
                    <tr><td>Issuer Wallet</td><td className="mono">{result.chain?.issuer}</td></tr>
                    <tr><td>Student Wallet</td><td className="mono">{result.chain?.student}</td></tr>
                    <tr>
                      <td>TX Hash</td>
                      <td>
                        {result.txHash ? (
                          <a href={`${TX_EXPLORER_URL}/${result.txHash}`}
                            target="_blank" rel="noreferrer">
                            {result.txHash.slice(0, 20)}…
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td>Document Hash</td>
                      <td className="mono hash-cell">{result.chain?.hash}</td>
                    </tr>
                    <tr>
                      <td>IPFS CID</td>
                      <td>
                        <a href={result.ipfsUrl} target="_blank" rel="noreferrer">
                          {result.chain?.cid?.slice(0, 20)}… (View PDF)
                        </a>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* Revocation info */}
              {result.revoked && result.revokedAt && (
                <section className="result-section revoked-section">
                  <h3>🚫 Revocation Details</h3>
                  <p>Revoked on: {new Date(result.revokedAt).toLocaleString()}</p>
                  {result.revokedTxHash && (
                    <a href={`${TX_EXPLORER_URL}/${result.revokedTxHash}`}
                      target="_blank" rel="noreferrer">
                      Revocation TX →
                    </a>
                  )}
                </section>
              )}
            </div>

            {/* Quick links */}
            <div className="verify-actions">
              <a href="/tamper" className="btn btn-outline">🔬 Check for Tampering</a>
              <a href={`/student?address=${result.chain?.student}`} className="btn btn-outline">
                👤 View Credential History
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="verify-footer">
        <a href="/login">Issuer Portal →</a>
      </div>
    </div>
  );
}
