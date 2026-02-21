import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { ethers, isAddress, Wallet } from "ethers";
import { prepareIssuance, confirmIssuance } from "../utils/api";
import { CERTIFICATE_REGISTRY_ABI } from "../utils/contractABI";
import Layout from "../components/Layout";

const TX_EXPLORER_URL = process.env.REACT_APP_TX_EXPLORER_URL || "https://amoy.polygonscan.com/tx";
const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;

export default function IssuePage() {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({
    studentAddress: "",
    studentName: "",
    courseName: "",
    grade: "",
    issueDate: new Date().toISOString().split("T")[0],
    organizationName: "",
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const onDrop = useCallback(accepted => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return setError("Please upload a PDF file");

    // Check MetaMask availability
    if (!window.ethereum) {
      return setError("MetaMask is not installed. Please install MetaMask to issue certificates.");
    }

    let normalizedStudentAddress = form.studentAddress.trim();
    const maybePrivateKey = normalizedStudentAddress.replace(/^0x/, "");
    if (/^[0-9a-fA-F]{64}$/.test(maybePrivateKey)) {
      try {
        normalizedStudentAddress = new Wallet(`0x${maybePrivateKey}`).address;
        setInfo(`Private key converted to wallet address: ${normalizedStudentAddress}`);
        setForm((prev) => ({ ...prev, studentAddress: normalizedStudentAddress }));
      } catch {
        return setError("Invalid private key format");
      }
    } else {
      setInfo("");
    }
    if (!isAddress(normalizedStudentAddress)) {
      return setError("Invalid student wallet address. Expected format: 0x...");
    }

    setError("");
    setLoading(true);
    setResult(null);

    try {
      // ── Step 1: Prepare (IPFS upload + metadata) ───────
      setStatus("⬆️ Uploading certificate to IPFS...");
      const fd = new FormData();
      fd.append("certificate", file);
      Object.entries({
        ...form,
        studentAddress: normalizedStudentAddress,
      }).forEach(([k, v]) => fd.append(k, v));

      const prepRes = await prepareIssuance(fd);
      const prep = prepRes.data;

      // ── Step 2: Sign via MetaMask ──────────────────────
      setStatus("🦊 Please confirm the transaction in MetaMask...");
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      const signer = await browserProvider.getSigner();

      const contractAddr = prep.contractAddress || CONTRACT_ADDRESS;
      if (!contractAddr) {
        throw new Error("Contract address not configured. Set REACT_APP_CONTRACT_ADDRESS in .env");
      }

      const contract = new ethers.Contract(contractAddr, CERTIFICATE_REGISTRY_ABI, signer);
      const tx = await contract.issueCertificate(
        prep.certId,
        prep.hash,
        prep.cid,
        prep.studentAddress,
        prep.metadata
      );

      setStatus("⛓️ Waiting for blockchain confirmation...");
      const receipt = await tx.wait();
      const txHash = receipt.hash;

      // ── Step 3: Confirm (save to DB) ───────────────────
      setStatus("💾 Saving certificate record...");
      const confirmRes = await confirmIssuance({
        certId: prep.certId,
        txHash,
        cid: prep.cid,
        hash: prep.hash,
        studentAddress: prep.studentAddress,
        studentName: prep.studentName,
        courseName: prep.courseName,
        grade: prep.grade,
        issueDate: prep.issueDate,
        organizationName: prep.organizationName,
        qrCode: prep.qrCode,
        verifyUrl: prep.verifyUrl,
      });

      setResult(confirmRes.data);
      setFile(null);
    } catch (err) {
      // MetaMask user rejection
      if (err.code === 4001 || err.code === "ACTION_REJECTED") {
        setError("Transaction was rejected in MetaMask.");
      } else {
        const apiError = err.response?.data;
        const msg = apiError?.details
          ? `${apiError.error}: ${apiError.details}`
          : apiError?.error || err.message || "Issuance failed";
        setError(msg);
      }
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  const field = (label, key, type = "text", placeholder = "") => (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        required
      />
    </div>
  );

  return (
    <Layout title="Issue Certificate">
      <div className="card">
        <form onSubmit={handleSubmit}>
          <h2 className="section-title">📜 New Certificate</h2>

          {/* PDF Dropzone */}
          <div {...getRootProps()} className={`dropzone ${isDragActive ? "active" : ""} ${file ? "has-file" : ""}`}>
            <input {...getInputProps()} />
            {file
              ? <p>✅ <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)</p>
              : <p>{isDragActive ? "Drop the PDF here…" : "Drag & drop certificate PDF, or click to browse"}</p>
            }
          </div>

          <div className="form-grid">
            {field("Student Wallet Address (or Private Key)", "studentAddress", "text", "0x... or 64-char key")}
            {field("Student Name", "studentName", "text", "Arjun Sharma")}
            {field("Course / Program Name", "courseName", "text", "Full Stack Development")}
            {field("Grade / Score", "grade", "text", "A+")}
            {field("Issue Date", "issueDate", "date")}
            {field("Organization Name", "organizationName", "text", "Yovaan AI Academy")}
          </div>

          {info && <div className="alert alert-success">{info}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading || !file}>
            {loading ? (status || "⏳ Processing…") : "🚀 Issue Certificate"}
          </button>
        </form>

        {/* Success Result */}
        {result && (
          <div className="result-card success">
            <h3>✅ Certificate Issued Successfully!</h3>
            <div className="result-grid">
              <div className="result-item">
                <span className="label">Certificate ID</span>
                <code>{result.certId}</code>
              </div>
              <div className="result-item">
                <span className="label">TX Hash</span>
                <a href={`${TX_EXPLORER_URL}/${result.txHash}`} target="_blank" rel="noreferrer">
                  {result.txHash?.slice(0, 20)}…
                </a>
              </div>
              <div className="result-item">
                <span className="label">IPFS CID</span>
                <a href={result.ipfsUrl} target="_blank" rel="noreferrer">
                  {result.cid?.slice(0, 20)}…
                </a>
              </div>
              <div className="result-item">
                <span className="label">Verify URL</span>
                <a href={result.verifyUrl} target="_blank" rel="noreferrer">{result.verifyUrl}</a>
              </div>
            </div>
            {result.qrCode && (
              <div className="qr-container">
                <p>QR Code for student / employer:</p>
                <img src={result.qrCode} alt="QR Code" width={180} />
                <a href={result.qrCode} download={`${result.certId}-QR.png`} className="btn btn-secondary">
                  ⬇️ Download QR
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
