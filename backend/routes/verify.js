/**
 * Public Verification Route — NO authentication required
 * GET /api/verify/:certId
 *
 * Called by the public verification portal when a QR is scanned.
 * Reads from both blockchain (source of truth) and MongoDB (for QR/metadata).
 */

import { Router } from "express";
import { getCertificateFromChain } from "../services/blockchain.js";
import Certificate from "../models/Certificate.js";

const router = Router();

function getBackendBaseUrl(req) {
  return process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
}

function buildOriginalFileUrl(req, certId) {
  return `${getBackendBaseUrl(req)}/api/certificates/${certId}/original-file`;
}

router.get("/:certId", async (req, res) => {
  try {
    const { certId } = req.params;

    // Primary: get authoritative data from blockchain
    let chainData;
    try {
      chainData = await getCertificateFromChain(certId);
    } catch {
      return res.status(404).json({
        valid: false,
        error: "Certificate not found on blockchain",
        certId,
      });
    }

    // Secondary: get QR + human-readable data from DB
    const dbData = await Certificate.findOne({ certId }).select("-__v").lean();

    // Parse metadata JSON stored on-chain
    let metadata = {};
    try {
      metadata = JSON.parse(chainData.metadata);
    } catch { /* ignore */ }

    const issuedAt = new Date(chainData.timestamp * 1000);

    res.json({
      valid:   !chainData.revoked,
      revoked:  chainData.revoked,
      certId,
      // On-chain authoritative fields
      chain: {
        issuer:    chainData.issuer,
        student:   chainData.student,
        hash:      chainData.hash,
        cid:       chainData.cid,
        issuedAt:  issuedAt.toISOString(),
        timestamp: chainData.timestamp,
      },
      // Human-readable metadata
      metadata,
      // IPFS document link
      ipfsUrl: buildOriginalFileUrl(req, certId),
      // QR code and extra DB data (if available)
      ...(dbData && {
        txHash:           dbData.txHash,
        qrCode:           dbData.qrCodeData,
        revokedTxHash:    dbData.revokedTxHash,
        revokedAt:        dbData.revokedAt,
      }),
    });
  } catch (err) {
    console.error("[Verify Error]", err);
    res.status(500).json({ error: "Verification failed", detail: err.message });
  }
});

export default router;
