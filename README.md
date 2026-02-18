# Yovaan AI - Decentralized Certificate Authentication

Blockchain-backed certificate issuance, verification, revocation, and tamper detection.

## Stack

- Smart Contract: Solidity + Hardhat
- Network: Polygon Amoy (`chainId 80002`)
- Backend: Node.js + Express + MongoDB + Ethers
- File Storage: IPFS via Pinata
- Frontend: React (CRA)

## Project Structure

```text
.
├── contracts/
├── scripts/
├── backend/
└── frontend/
```

## Prerequisites

- Node.js 20+
- npm 10+
- MongoDB Atlas connection string
- Pinata JWT
- Alchemy Amoy RPC URL
- Wallet private key with Amoy test MATIC

## Environment Setup

### 1) Root env for Hardhat

Create `.env` in project root:

```env
ALCHEMY_AMOY_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY
DEPLOYER_PRIVATE_KEY=YOUR_PRIVATE_KEY_WITHOUT_0x
ISSUER_PRIVATE_KEY=YOUR_ISSUER_PRIVATE_KEY_WITHOUT_0x
ISSUER_ADDRESS=0xIssuerWalletAddress
CONTRACT_ADDRESS=0xYourDeployedContractAddress
CHAIN_ID=80002
POLYGONSCAN_API_KEY=
```

### 2) Backend env

Create `backend/.env` (or copy from `backend/env.example`):

```env
ALCHEMY_AMOY_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY
ISSUER_PRIVATE_KEY=YOUR_ISSUER_PRIVATE_KEY_WITHOUT_0x
CONTRACT_ADDRESS=0xYourDeployedContractAddress
CHAIN_ID=80002
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>
PINATA_JWT=YOUR_PINATA_JWT
PINATA_API_KEY=
PINATA_API_SECRET=
JWT_SECRET=replace_with_strong_secret
JWT_EXPIRES_IN=8h
PORT=5000
NODE_ENV=development
BACKEND_PUBLIC_URL=http://localhost:5000
VERIFY_BASE_URL=http://localhost:3000/verify
FRONTEND_URL=http://localhost:3000
IPFS_GATEWAY_BASE_URL=https://gateway.pinata.cloud/ipfs
ADMIN_EMAIL=admin@yovaanai.com
ADMIN_PASSWORD=ChangeThisPassword123!
```

### 3) Frontend env

Create `frontend/.env.local` (or copy from `frontend/env.example`):

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_TX_EXPLORER_URL=https://amoy.polygonscan.com/tx
```

## Install Dependencies

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

## Smart Contract: Compile and Deploy

```bash
npm run compile
npm run deploy:amoy
```

After deployment:

1. Copy deployed address into `backend/.env` as `CONTRACT_ADDRESS`.
2. Ensure `ISSUER_PRIVATE_KEY` is a wallet authorized on contract.

## Authorize Issuer Wallet

```bash
npm run issuer:add
```

The script reads `CONTRACT_ADDRESS` and `ISSUER_ADDRESS` (or derives from `ISSUER_PRIVATE_KEY`).

## Current Deployment (Executed)

- Contract: `0x0c8815418C568F9c6Be3c6aAe565f909f27fc52c`
- Network: Polygon Amoy (`80002`)
- Deployer / Issuer: `0x7dE4fEd8C2F2419A96C007f3a43cf629408536A0`
- Issuer authorization tx: `0x3a33a6656b8a978d211551c6f78bdbc70f3c294b3f36f5ce2c0b75e9f3814efe`

## Seed Admin User

```bash
cd backend
npm run seed:admin
```

This creates/updates the admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Run Locally

Terminal 1:

```bash
cd backend
npm start
```

Terminal 2:

```bash
cd frontend
npm start
```

Frontend: `http://localhost:3000`  
Backend: `http://localhost:5000`

## Smoke Tests

### Health check

```bash
curl http://localhost:5000/api/health
```

Expected: JSON with `"status":"ok"`.

### Admin login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yovaanai.com","password":"ChangeThisPassword123!"}'
```

Expected: JWT token + user object.

### Issue certificate (API)

```bash
TOKEN=<JWT_FROM_LOGIN>
curl -X POST http://localhost:5000/api/certificates/issue \
  -H "Authorization: Bearer $TOKEN" \
  -F "certificate=@/absolute/path/to/certificate.pdf" \
  -F "studentAddress=0xStudentWalletAddress" \
  -F "studentName=Arjun Sharma" \
  -F "courseName=Full Stack Development" \
  -F "grade=A+" \
  -F "issueDate=2026-02-18" \
  -F "organizationName=Yovaan AI"
```

Expected: `certId`, `txHash`, `cid`, `verifyUrl`, and `qrCode`.
If you get `403` from Pinata, regenerate `PINATA_JWT` with pinning permission.

### Verify certificate

```bash
curl http://localhost:5000/api/verify/<CERT_ID>
```

Expected: `valid/revoked` status, chain data, and metadata.

### Tamper check

Cert-ID only integrity check (no upload):

```bash
curl -X POST http://localhost:5000/api/certificates/tamper-check \
  -F "certId=<CERT_ID>"
```

Cert-ID + uploaded file comparison:

```bash
curl -X POST http://localhost:5000/api/certificates/tamper-check \
  -F "certificate=@/absolute/path/to/certificate.pdf" \
  -F "certId=<CERT_ID>"
```

Expected: `mode`, `authentic`, hashes, and `ipfsUrl` for the exact original file resolved by cert ID.

### Revoke certificate

```bash
curl -X POST http://localhost:5000/api/certificates/revoke \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"certId":"<CERT_ID>"}'
```

Expected: revocation transaction hash and success message.

## Troubleshooting

- `CertReg: Not an authorized issuer`: call `addIssuer()` from owner wallet.
- `CONTRACT_ADDRESS` missing: update `backend/.env` after deployment.
- IPFS upload failure: verify `PINATA_JWT`.
- Pinata `403 Forbidden`: token scope/plan issue. Create a fresh JWT in Pinata and retry.
- IPFS link inaccessible in browser: use `/api/certificates/:certId/original-file` (returned as `ipfsUrl`) so the backend resolves the exact CID for that certificate ID.
- Mongo connection failure: verify `MONGODB_URI` and network access.
- `No token provided` on `/api/certificates/issue`: this endpoint is protected; login first and send `Authorization: Bearer <JWT>` (or use frontend at `/issue`).

## Notes

- This repo is configured for **Polygon Amoy** (not Mumbai).
- IPFS upload uses Pinata `v3/files` (with legacy fallback).
- `.gitignore` excludes `.env` and `node_modules`.
- If any secrets were shared publicly, rotate them immediately.
