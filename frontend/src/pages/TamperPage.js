import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { tamperCheck } from "../utils/api";

async function sha256Hex(file) {
  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function TamperPage() {
  const [file, setFile]       = useState(null);
  const [certId, setCertId]   = useState("");
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [loadingMessage, setLoadingMessage] = useState("");

  const onDrop = useCallback(accepted => setFile(accepted[0]), []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
  });

  async function handleCheck(e) {
    e.preventDefault();
    if (!certId) return;
    const normalizedCertId = certId.trim().toUpperCase();
    if (!/^YOVAAN-[A-Z0-9]{8}$/.test(normalizedCertId)) {
      return setError("Invalid certId format. Expected: YOVAAN-XXXXXXXX");
    }

    setError("");
    setResult(null);
    setLoading(true);
    setLoadingMessage(file
      ? "Fetching original file from IPFS for this certificate ID..."
      : "Fetching original file from IPFS for this certificate ID and validating hash...");
    try {
      const fd = new FormData();
      fd.append("certId", normalizedCertId);
      if (file) {
        let clientHash = "";
        try {
          clientHash = await sha256Hex(file);
        } catch {
          // Continue without client hash in environments where Web Crypto is unavailable.
        }
        fd.append("certificate", file);
        if (clientHash) fd.append("clientHash", clientHash);
        setLoadingMessage("Comparing uploaded file bytes with original certificate bytes...");
      }
      const res = await tamperCheck(fd);
      setResult(res.data);
    } catch (err) {
      const apiError = err.response?.data;
      const msg = apiError?.details
        ? `${apiError.error}: ${apiError.details}`
        : apiError?.error || "Check failed";
      setError(msg);
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }

  return (
    <div className="verify-wrapper">
      <div className="verify-header">
        <span className="logo-icon">🔬</span>
        <h1>Tamper Detection</h1>
        <p>Enter certificate ID to validate original bytes. Upload is optional for local file comparison.</p>
        <p style={{ fontSize: ".85rem", color: "#64748b", marginTop: 6 }}>
          Hash basis: SHA-256 of exact PDF bytes. Re-saving/re-exporting a PDF can change bytes.
        </p>
      </div>

      <div className="verify-card">
        <form onSubmit={handleCheck}>
          <div className="field">
            <label>Certificate ID</label>
            <input
              type="text"
              value={certId}
              onChange={e => setCertId(e.target.value.toUpperCase())}
              placeholder="YOVAAN-XXXXXXXX"
              required
            />
          </div>

          <div {...getRootProps()} className={`dropzone ${isDragActive ? "active" : ""} ${file ? "has-file" : ""}`}>
            <input {...getInputProps()} />
            {file
              ? <p>✅ <strong>{file.name}</strong></p>
              : <p>Optional: drop a certificate PDF to compare with original, or click to browse</p>
            }
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {loading && (
            <div className="alert alert-success">
              ⏳ {loadingMessage}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading || !certId}>
            {loading ? "Analyzing…" : (file ? "🔬 Compare Uploaded vs Original" : "🔬 Check Original Integrity")}
          </button>
        </form>

        {result && (
          <div className="tamper-result">
            <div className={`status-banner ${result.authentic ? "status-valid" : (result.revoked ? "status-revoked" : "status-invalid")}`}>
              {result.verdict}
            </div>

            <div className="hash-comparison">
              {result.mode === "cert-id-only" ? (
                <>
                  <div className="hash-row">
                    <span className="hash-label">Blockchain Hash (Original)</span>
                    <code className="hash-val original">{result.originalHash}</code>
                  </div>
                  <div className="hash-row">
                    <span className="hash-label">Fetched IPFS Original Hash</span>
                    <code className={`hash-val ${result.ipfsByteMatchOnChain ? "match" : "mismatch"}`}>
                      {result.originalIpfsHash}
                    </code>
                  </div>
                  <div className={`hash-match-indicator ${result.ipfsByteMatchOnChain ? "matched" : "not-matched"}`}>
                    {result.ipfsByteMatchOnChain
                      ? (result.revoked
                        ? "🟡 Original file is intact, but certificate is revoked"
                        : "🟢 Original file is intact — IPFS bytes match blockchain hash")
                      : "🔴 Integrity alert — IPFS bytes do not match blockchain hash"}
                  </div>
                </>
              ) : (
                <>
                  <div className="hash-row">
                    <span className="hash-label">Uploaded File Hash</span>
                    <code className={`hash-val ${result.authentic ? "match" : "mismatch"}`}>
                      {result.uploadedHash}
                    </code>
                  </div>
                  <div className="hash-row">
                    <span className="hash-label">Blockchain Hash (Original)</span>
                    <code className="hash-val original">{result.originalHash}</code>
                  </div>
                  <div className={`hash-match-indicator ${result.authentic ? "matched" : "not-matched"}`}>
                    {result.byteMatch
                      ? (result.revoked
                        ? "🟡 Hashes match, but certificate is revoked"
                        : "🟢 Hashes match — exact original file")
                      : (result.certificateActive
                        ? "🟠 Hashes differ — uploaded file differs from original bytes for this certificate ID"
                        : "🔴 Hashes differ and certificate is revoked")}
                  </div>
                </>
              )}
              {result.cid && (
                <div className="hash-row" style={{ marginTop: 8 }}>
                  <span className="hash-label">IPFS CID (from certificate ID)</span>
                  <code className="hash-val original">{result.cid}</code>
                </div>
              )}
              {result.metadata && (
                <div className="hash-row" style={{ marginTop: 8 }}>
                  <span className="hash-label">Certificate Metadata (from chain)</span>
                  <code className="hash-val original">
                    {[
                      result.metadata.studentName,
                      result.metadata.courseName,
                      result.metadata.organizationName,
                    ].filter(Boolean).join(" | ") || "Metadata present"}
                  </code>
                </div>
              )}
              {result.transferIntact !== null && (
                <div className="hash-match-indicator" style={{ marginTop: 10 }}>
                  {result.transferIntact
                    ? "🟢 Upload transfer intact — browser hash equals backend hash"
                    : "🔴 Upload transfer mismatch — browser hash and backend hash differ"}
                </div>
              )}
            </div>

            {result.ipfsUrl && (
              <a href={result.ipfsUrl} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ marginBottom: 10 }}>
                View Original from IPFS →
              </a>
            )}
            <a href={`/verify?certId=${result.certId || certId}`} className="btn btn-outline">
              View Full Certificate →
            </a>
          </div>
        )}
      </div>

      <div className="verify-footer">
        <a href="/verify">← Verification Portal</a>
      </div>
    </div>
  );
}
