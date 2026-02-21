import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// ABI — only the functions we call
const ABI = [
  "function issueCertificate(string certId, string hash, string cid, address student, string metadata) external",
  "function revokeCertificate(string certId) external",
  "function getCertificate(string certId) external view returns (tuple(string certId, string hash, string cid, address issuer, address student, uint256 timestamp, bool revoked, string metadata))",
  "function getStudentCertificates(address student) external view returns (string[])",
  "function checkCertificate(string certId) external view returns (bool exists, bool revoked)",
  "function authorizedIssuers(address) external view returns (bool)",
];

let provider, revokeSigner, contract;
const DEFAULT_AMOY_RPC = "https://rpc-amoy.polygon.technology";

function getRpcUrl() {
  return (
    process.env.ALCHEMY_AMOY_URL ||
    process.env.AMOY_RPC_URL ||
    process.env.MUMBAI_RPC_URL ||
    DEFAULT_AMOY_RPC
  );
}

function normalizePrivateKey(key) {
  if (!key) return "";
  return key.startsWith("0x") ? key : `0x${key}`;
}

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(getRpcUrl());
  }
  return provider;
}

/**
 * Signer used ONLY for admin-initiated revocations.
 * Certificate issuance signing has been moved to the frontend (MetaMask).
 */
function getRevokeSigner() {
  if (!revokeSigner) {
    const key = process.env.REVOKE_PRIVATE_KEY || process.env.ISSUER_PRIVATE_KEY;
    if (!key) {
      throw new Error("REVOKE_PRIVATE_KEY (or legacy ISSUER_PRIVATE_KEY) is required for revocation");
    }
    revokeSigner = new ethers.Wallet(normalizePrivateKey(key), getProvider());
  }
  return revokeSigner;
}

function getContract(withSigner = false) {
  const runner = withSigner ? getRevokeSigner() : getProvider();
  if (!contract) {
    contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, runner);
  }
  return withSigner ? contract.connect(runner) : contract;
}

// ── Write Operations (admin-only revocation) ──────────────

/**
 * Revokes a certificate on-chain (admin operation, uses server signer)
 * @returns {string} Transaction hash
 */
export async function revokeCertificateOnChain(certId) {
  const c = getContract(true);
  const tx = await c.revokeCertificate(certId);
  const receipt = await tx.wait();
  return receipt.hash;
}

// ── Read Operations ──────────────────────────────────────

/**
 * Fetches full certificate struct from chain
 */
export async function getCertificateFromChain(certId) {
  const c = getContract(false);
  const raw = await c.getCertificate(certId);
  return {
    certId: raw.certId,
    hash: raw.hash,
    cid: raw.cid,
    issuer: raw.issuer,
    student: raw.student,
    timestamp: Number(raw.timestamp),
    revoked: raw.revoked,
    metadata: raw.metadata,
  };
}

/**
 * Returns all certIds for a student wallet
 */
export async function getStudentCertificatesFromChain(studentAddress) {
  const c = getContract(false);
  return c.getStudentCertificates(studentAddress);
}

/**
 * Quick check — returns { exists, revoked }
 */
export async function checkCertificateOnChain(certId) {
  const c = getContract(false);
  const [exists, revoked] = await c.checkCertificate(certId);
  return { exists, revoked };
}

export { getProvider };
