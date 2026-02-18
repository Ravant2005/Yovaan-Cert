/**
 * Certificate Routes
 * POST /api/certificates/issue        — Upload PDF, mint on-chain
 * GET  /api/certificates              — List all (issuer)
 * GET  /api/certificates/:certId      — Single cert details
 * POST /api/certificates/revoke       — Revoke a cert
 * POST /api/certificates/tamper-check — Hash compare
 * GET  /api/certificates/student/:address — Student's cert history
 */

import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { ethers } from "ethers";
import { protect } from "../middleware/auth.js";
import Certificate from "../models/Certificate.js";
import {
  issueCertificateOnChain,
  revokeCertificateOnChain,
  checkCertificateOnChain,
  getCertificateFromChain,
  getStudentCertificatesFromChain,
} from "../services/blockchain.js";
import { fetchIPFSFile, uploadToIPFS } from "../services/ipfs.js";

const router = Router();

function validateStudentAddress(studentAddress) {
  const value = String(studentAddress || "").trim();
  if (!value) return { ok: false, message: "studentAddress is required" };

  // Users sometimes paste a private key here. Reject with explicit guidance.
  const maybePrivateKey = value.replace(/^0x/, "");
  if (/^[0-9a-fA-F]{64}$/.test(maybePrivateKey)) {
    return {
      ok: false,
      message: "studentAddress must be a wallet address (0x...), not a private key",
    };
  }

  if (!ethers.isAddress(value)) {
    return { ok: false, message: "Invalid studentAddress. Expected EVM address format: 0x..." };
  }

  return { ok: true, address: ethers.getAddress(value) };
}

function normalizeCertId(certId) {
  return String(certId || "").trim().toUpperCase();
}

function isLikelyCertId(certId) {
  return /^YOVAAN-[A-Z0-9]{8}$/.test(certId);
}

function getBackendBaseUrl(req) {
  return process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
}

function buildOriginalFileUrl(req, certId) {
  return `${getBackendBaseUrl(req)}/api/certificates/${certId}/original-file`;
}

// Multer — memory storage (no disk, goes straight to IPFS)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_, file, cb) => {
    if (file.mimetype !== "application/pdf")
      return cb(new Error("Only PDF files are allowed"), false);
    cb(null, true);
  },
});

// ── ISSUE ────────────────────────────────────────────────

router.post("/issue", protect, upload.single("certificate"), async (req, res) => {
  try {
    const { studentAddress, studentName, courseName, grade, issueDate, organizationName } =
      req.body;

    if (!req.file) return res.status(400).json({ error: "No PDF file uploaded" });
    const studentCheck = validateStudentAddress(studentAddress);
    if (!studentCheck.ok) return res.status(400).json({ error: studentCheck.message });
    const normalizedStudentAddress = studentCheck.address;

    // 1. SHA-256 hash of the raw file buffer
    const hash = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    // 2. Check for duplicate (same hash = same file, prevent re-issue)
    const duplicate = await Certificate.findOne({ hash });
    if (duplicate) {
      return res.status(409).json({
        error: "This exact certificate has already been issued",
        existingCertId: duplicate.certId,
      });
    }

    // 3. Upload PDF to IPFS
    console.log("⬆️  Uploading to IPFS...");
    const cid = await uploadToIPFS(req.file.buffer, req.file.originalname);
    console.log("✅ IPFS CID:", cid);

    // 4. Generate unique cert ID
    const certId = `YOVAAN-${uuidv4().toUpperCase().slice(0, 8)}`;

    // 5. Metadata JSON (stored on-chain and in DB)
    const metadata = JSON.stringify({
      studentName,
      courseName,
      grade,
      issueDate,
      organizationName,
    });

    // 6. Issue on blockchain
    console.log("⛓️  Writing to blockchain...");
    const txHash = await issueCertificateOnChain({
      certId,
      hash,
      cid,
      studentAddress: normalizedStudentAddress,
      metadata,
    });
    console.log("✅ TX Hash:", txHash);

    // 7. Generate QR code pointing to verification portal
    const verifyUrl = `${process.env.VERIFY_BASE_URL || "http://localhost:3000/verify"}?certId=${certId}`;
    const qrCodeData = await QRCode.toDataURL(verifyUrl);

    // 8. Save to MongoDB (fast-read cache)
    const cert = await Certificate.create({
      certId,
      hash,
      cid,
      issuerAddress: req.body.issuerAddress || "0x0",
      studentAddress: normalizedStudentAddress.toLowerCase(),
      txHash,
      qrCodeData,
      verifyUrl,
      studentName,
      courseName,
      grade,
      issueDate,
      organizationName,
    });

    res.status(201).json({
      success: true,
      certId,
      txHash,
      cid,
      ipfsUrl: buildOriginalFileUrl(req, certId),
      verifyUrl,
      qrCode: qrCodeData,
    });
  } catch (err) {
    console.error("[Issue Error]", err);
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    res.status(status).json({
      error: err.message || "Certificate issuance failed",
      code: err.code,
      details: err.details,
    });
  }
});

// ── LIST (Issuer's certs) ────────────────────────────────

router.get("/", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const query = search
      ? { $or: [{ studentName: new RegExp(search, "i") }, { courseName: new RegExp(search, "i") }] }
      : {};

    const [certs, total] = await Promise.all([
      Certificate.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Certificate.countDocuments(query),
    ]);

    res.json({ certs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SINGLE CERT ──────────────────────────────────────────

router.get("/:certId/original-file", async (req, res) => {
  try {
    const certId = normalizeCertId(req.params.certId);
    if (!isLikelyCertId(certId)) {
      return res.status(400).json({
        error: "Invalid certId format. Expected format: YOVAAN-XXXXXXXX",
      });
    }

    const { exists } = await checkCertificateOnChain(certId);
    if (!exists) {
      return res.status(404).json({
        error: "Certificate not found. Check certId and try again.",
      });
    }

    const onChain = await getCertificateFromChain(certId);
    const originalFile = await fetchIPFSFile(onChain.cid);
    const fetchedHash = crypto
      .createHash("sha256")
      .update(originalFile.buffer)
      .digest("hex");

    res.setHeader("Content-Type", originalFile.contentType || "application/pdf");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Disposition", `inline; filename="${certId}.pdf"`);
    res.setHeader("X-Certificate-Id", certId);
    res.setHeader("X-IPFS-CID", onChain.cid);
    res.setHeader("X-Blockchain-Hash", onChain.hash);
    res.setHeader("X-Fetched-Hash", fetchedHash);
    res.send(originalFile.buffer);
  } catch (err) {
    res.status(502).json({
      error: "Unable to fetch original certificate file from IPFS",
      details: err.message,
    });
  }
});

router.get("/:certId", protect, async (req, res) => {
  try {
    const cert = await Certificate.findOne({ certId: req.params.certId });
    if (!cert) return res.status(404).json({ error: "Certificate not found" });
    res.json(cert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REVOKE ───────────────────────────────────────────────

router.post("/revoke", protect, async (req, res) => {
  try {
    const { certId, reason } = req.body;
    if (!certId) return res.status(400).json({ error: "certId is required" });

    const cert = await Certificate.findOne({ certId });
    if (!cert) return res.status(404).json({ error: "Certificate not found in DB" });
    if (cert.revoked) return res.status(409).json({ error: "Already revoked" });

    // Revoke on chain
    const txHash = await revokeCertificateOnChain(certId);

    // Update DB
    await Certificate.findOneAndUpdate(
      { certId },
      { revoked: true, revokedTxHash: txHash, revokedAt: new Date() }
    );

    res.json({ success: true, txHash, message: `Certificate ${certId} revoked` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TAMPER CHECK ─────────────────────────────────────────

router.post("/tamper-check", upload.single("certificate"), async (req, res) => {
  try {
    const certId = normalizeCertId(req.body.certId);
    const clientHash = String(req.body.clientHash || "").trim().toLowerCase();
    if (!certId) return res.status(400).json({ error: "certId is required" });
    if (!isLikelyCertId(certId)) {
      return res.status(400).json({
        error: "Invalid certId format. Expected format: YOVAAN-XXXXXXXX",
      });
    }

    const { exists } = await checkCertificateOnChain(certId);
    if (!exists) {
      return res.status(404).json({
        error: "Certificate not found. Check certId and try again.",
      });
    }

    // Get original hash + CID from blockchain (source of truth)
    const onChain = await getCertificateFromChain(certId);

    const ipfsFile = await fetchIPFSFile(onChain.cid);
    const originalIpfsHash = crypto
      .createHash("sha256")
      .update(ipfsFile.buffer)
      .digest("hex");
    const ipfsByteMatchOnChain = originalIpfsHash === onChain.hash;
    const certificateActive = !onChain.revoked;

    let metadata = null;
    try {
      metadata = JSON.parse(onChain.metadata || "{}");
    } catch {
      metadata = null;
    }

    // Cert-only mode: validate chain hash vs fetched original bytes, no uploaded file required.
    if (!req.file) {
      const authentic = ipfsByteMatchOnChain && certificateActive;
      let verdict;
      if (ipfsByteMatchOnChain && certificateActive) {
        verdict = "✅ Original IPFS file is intact and matches blockchain hash";
      } else if (ipfsByteMatchOnChain && !certificateActive) {
        verdict = "⚠️ Original IPFS file matches blockchain hash, but certificate is REVOKED";
      } else {
        verdict = "🚨 Integrity alert - Original IPFS bytes do not match blockchain hash";
      }

      return res.json({
        mode: "cert-id-only",
        authentic,
        byteMatch: null,
        certificateActive,
        certId,
        cid: onChain.cid,
        uploadedHash: null,
        originalHash: onChain.hash,
        clientHash: clientHash || null,
        transferIntact: null,
        originalIpfsHash,
        ipfsByteMatchOnChain,
        revoked: onChain.revoked,
        metadata,
        ipfsUrl: buildOriginalFileUrl(req, certId),
        verdict,
      });
    }

    // Upload mode: compare uploaded file bytes vs original bytes fetched by certId -> CID.
    const uploadedHash = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");
    const transferIntact = clientHash ? clientHash === uploadedHash : null;
    // Primary tamper comparison: uploaded file vs original bytes fetched by certId -> CID.
    const byteMatch = uploadedHash === originalIpfsHash;
    const authentic = byteMatch && certificateActive && ipfsByteMatchOnChain;

    let verdict;
    if (!ipfsByteMatchOnChain) {
      verdict = "🚨 Integrity alert - Original IPFS bytes do not match blockchain hash";
    } else if (byteMatch && certificateActive) {
      verdict = "✅ Exact match - Uploaded file is identical to issued original";
    } else if (byteMatch && !certificateActive) {
      verdict = "⚠️ File matches original bytes, but certificate is REVOKED";
    } else if (!byteMatch && certificateActive) {
      verdict = "⚠️ Hash mismatch - Uploaded file differs from the issued original bytes";
    } else {
      verdict = "🚫 Certificate is revoked and uploaded file does not match issued original";
    }

    res.json({
      authentic,
      byteMatch,
      certificateActive,
      certId,
      cid: onChain.cid,
      uploadedHash,
      originalHash:  onChain.hash,
      clientHash: clientHash || null,
      transferIntact,
      originalIpfsHash,
      ipfsByteMatchOnChain,
      revoked:       onChain.revoked,
      metadata,
      ipfsUrl: buildOriginalFileUrl(req, certId),
      verdict,
    });
  } catch (err) {
    res.status(500).json({ error: "Tamper check failed", details: err.message });
  }
});

// ── STUDENT HISTORY ──────────────────────────────────────

router.get("/student/:address", async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();

    // Pull IDs from chain
    const certIds = await getStudentCertificatesFromChain(address);

    // Enrich from DB
    const certs = await Certificate.find({ certId: { $in: certIds } })
      .select("-qrCodeData") // exclude large QR blobs from list
      .lean();

    const certsWithProxy = certs.map((cert) => ({
      ...cert,
      ipfsUrl: buildOriginalFileUrl(req, cert.certId),
    }));

    res.json({ address, total: certsWithProxy.length, certs: certsWithProxy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
