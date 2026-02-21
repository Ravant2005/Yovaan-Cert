/**
 * Contract ABI for CertificateRegistry
 * Extracted from backend/services/blockchain.js for frontend use.
 * Only includes the functions the frontend calls directly.
 */
export const CERTIFICATE_REGISTRY_ABI = [
    "function issueCertificate(string certId, string hash, string cid, address student, string metadata) external",
    "function getCertificate(string certId) external view returns (tuple(string certId, string hash, string cid, address issuer, address student, uint256 timestamp, bool revoked, string metadata))",
    "function checkCertificate(string certId) external view returns (bool exists, bool revoked)",
    "function authorizedIssuers(address) external view returns (bool)",
];
