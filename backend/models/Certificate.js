import mongoose from "mongoose";
import { getIPFSUrl } from "../services/ipfs.js";

/**
 * MongoDB mirror of on-chain certificate data.
 * Acts as a fast-read cache + stores QR/metadata not on chain.
 */
const CertificateSchema = new mongoose.Schema(
  {
    certId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    hash: {
      type: String,
      required: true,
      length: 64, // SHA-256 hex
    },
    cid: {
      type: String,
      required: true,
    },
    issuerAddress: {
      type: String,
      required: true,
      lowercase: true,
    },
    studentAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    txHash: {
      type: String, // Blockchain transaction hash
    },
    qrCodeData: {
      type: String, // Base64 data URI of QR image
    },
    verifyUrl: {
      type: String,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
    revokedTxHash: {
      type: String,
    },
    revokedAt: {
      type: Date,
    },
    // Human-readable fields (also JSON-encoded in contract metadata)
    studentName: String,
    courseName: String,
    grade: String,
    issueDate: String,
    organizationName: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Virtual: IPFS gateway URL
CertificateSchema.virtual("ipfsUrl").get(function () {
  return getIPFSUrl(this.cid);
});

export default mongoose.model("Certificate", CertificateSchema);
