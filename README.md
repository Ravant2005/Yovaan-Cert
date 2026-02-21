# Yovaan AI — Decentralized Certificate Authentication

> **CertiChain** — Issue tamper-proof academic certificates anchored on the Polygon blockchain, stored on IPFS, and verified instantly by anyone.

---

## Table of Contents

- [System Overview](#system-overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
  - [Certificate Issuance Flow](#1-certificate-issuance-flow)
  - [Certificate Verification Flow](#2-certificate-verification-flow)
  - [Tamper Detection Flow](#3-tamper-detection-flow)
  - [Revocation Flow](#4-revocation-flow)
- [Security Features](#security-features)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Install Dependencies](#install-dependencies)
- [Smart Contract Deployment](#smart-contract-deployment)
- [Seed Admin User](#seed-admin-user)
- [Run Locally](#run-locally)
- [API Reference](#api-reference)
- [Smoke Tests](#smoke-tests)
- [Troubleshooting](#troubleshooting)

---

## System Overview

Yovaan AI is a **decentralized certificate authentication platform** that enables educational institutions and organizations to:

1. **Issue** blockchain-anchored certificates — each certificate's PDF is stored on IPFS and its SHA-256 hash is written to a Polygon smart contract.
2. **Verify** any certificate's authenticity instantly — anyone can enter a certificate ID and get a cryptographic proof that it hasn't been tampered with.
3. **Detect tampering** — upload a PDF and compare it byte-for-byte against the original stored on IPFS, with hashes checked against the blockchain.
4. **Revoke** certificates — issuers can permanently mark certificates as revoked on-chain.

The system is designed so that **no single server** can forge or tamper with a certificate — the blockchain and IPFS together form an immutable audit trail.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React CRA)                         │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  Login   │  │  Issue   │  │  Verify  │  │  Tamper  │            │
│  │  Page    │  │  Page    │  │  Page    │  │  Check   │            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │              │              │              │                 │
│       │         ┌────▼─────┐        │              │                 │
│       │         │ MetaMask │        │              │                 │
│       │         │ (ethers) │        │              │                 │
│       │         └────┬─────┘        │              │                 │
└───────┼──────────────┼──────────────┼──────────────┼────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     BACKEND (Express + Node.js)                     │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Auth    │  │ Certificates │  │  Verify  │  │  IPFS    │        │
│  │  Routes  │  │   Routes     │  │  Routes  │  │  Routes  │        │
│  └────┬─────┘  └──────┬───────┘  └────┬─────┘  └────┬─────┘        │
│       │               │               │              │              │
│  ┌────▼─────┐  ┌──────▼───────┐  ┌────▼─────────────▼─────┐        │
│  │ MongoDB  │  │  Blockchain  │  │     IPFS Service        │        │
│  │ (Users)  │  │   Service    │  │  (Pinata + Gateways)    │        │
│  └──────────┘  └──────┬───────┘  └────────────┬────────────┘        │
└───────────────────────┼───────────────────────┼─────────────────────┘
                        │                       │
                        ▼                       ▼
             ┌──────────────────┐    ┌─────────────────┐
             │  Polygon Amoy    │    │   IPFS / Pinata  │
             │  Smart Contract  │    │   (PDF Storage)  │
             │  (CertRegistry)  │    │                  │
             └──────────────────┘    └─────────────────┘
```

### Data Flow Summary

| Component | Role |
|-----------|------|
| **React Frontend** | User interface + MetaMask transaction signing |
| **MetaMask** | Browser wallet that signs issuance transactions directly |
| **Express Backend** | API server, handles auth, IPFS uploads, DB caching, reads blockchain |
| **MongoDB** | Fast-read cache for certificate metadata, user accounts |
| **Polygon Smart Contract** | Immutable certificate registry (hash, CID, issuer, student, revocation status) |
| **IPFS (Pinata)** | Decentralized file storage for certificate PDFs |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Solidity 0.8.20 + OpenZeppelin + Hardhat |
| Blockchain | Polygon Amoy Testnet (chain ID `80002`) |
| Backend | Node.js + Express + Mongoose |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Validation | Joi (strict metadata schemas) |
| File Storage | IPFS via Pinata (v3 API with legacy fallback) |
| Frontend | React 18 (Create React App) |
| Wallet Integration | ethers.js v6 + MetaMask (BrowserProvider) |
| QR Codes | qrcode (server-side generation) |

---

## Project Structure

```text
CertiChain/
├── contracts/
│   └── CertificateRegistry.sol     # Solidity smart contract
├── scripts/
│   ├── deploy.js                    # Hardhat deployment script
│   └── addIssuer.js                 # Authorize an issuer wallet
├── backend/
│   ├── server.js                    # Express app entry point
│   ├── middleware/
│   │   └── auth.js                  # JWT protect + adminOnly + startup guard
│   ├── models/
│   │   ├── User.js                  # Mongoose user model (bcrypt hashing)
│   │   └── Certificate.js           # Mongoose certificate model
│   ├── routes/
│   │   ├── auth.js                  # Login, register, /me
│   │   ├── certificates.js          # Issue (prepare/confirm), revoke, tamper-check
│   │   ├── verify.js                # Public certificate verification
│   │   └── ipfs.js                  # IPFS utility routes
│   ├── services/
│   │   ├── blockchain.js            # Ethers.js contract interactions (read + revoke)
│   │   └── ipfs.js                  # Pinata upload + multi-gateway racing fetch
│   ├── scripts/
│   │   └── seedAdmin.js             # Bootstrap admin user
│   ├── env.example                  # Backend environment template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.js                   # React Router setup
│   │   ├── components/
│   │   │   └── Layout.js            # Shared page layout
│   │   ├── pages/
│   │   │   ├── LoginPage.js         # Admin/issuer login
│   │   │   ├── DashboardPage.js     # Main dashboard
│   │   │   ├── IssuePage.js         # Certificate issuance (MetaMask signing)
│   │   │   ├── CertListPage.js      # List issued certificates
│   │   │   ├── VerifyPage.js        # Public verification portal
│   │   │   ├── TamperPage.js        # Tamper detection tool
│   │   │   └── StudentPage.js       # Student certificate history
│   │   └── utils/
│   │       ├── api.js               # Axios API client
│   │       └── contractABI.js       # Smart contract ABI for browser
│   ├── env.example                  # Frontend environment template
│   └── package.json
├── hardhat.config.js                # Hardhat configuration
└── package.json                     # Root (Hardhat dependencies)
```

---

## How It Works

### 1. Certificate Issuance Flow

The issuance process is a **three-step handshake** between the frontend, backend, and blockchain:

```
  Issuer (Browser)              Backend (API)              Blockchain
       │                            │                          │
       │──── POST /issue/prepare ──▶│                          │
       │     (PDF + metadata)       │                          │
       │                            │── Upload PDF to IPFS ──▶ │
       │                            │── SHA-256 hash           │
       │                            │── Generate certId        │
       │                            │── Generate QR code       │
       │◀── { certId, hash, cid } ──│                          │
       │                            │                          │
       │── MetaMask signs tx ──────────────────────────────────▶│
       │   issueCertificate(                                   │
       │     certId, hash, cid,                                │
       │     studentAddr, metadata)                            │
       │◀──────────────────── tx receipt ──────────────────────│
       │                            │                          │
       │──── POST /issue/confirm ──▶│                          │
       │     (certId + txHash)      │── Save to MongoDB        │
       │◀──── { success, result } ──│                          │
```

**Step 1 — Prepare** (`POST /api/certificates/issue/prepare`):
- The issuer uploads a PDF and fills in metadata (student name, course, grade, etc.)
- The backend validates input with **Joi**, uploads the PDF to **IPFS via Pinata**, generates a unique `certId` (`YOVAAN-XXXXXXXX`), computes the **SHA-256 hash** of the PDF, and generates a **QR code**
- Returns all preparation data — **no database record or blockchain write yet**

**Step 2 — Sign** (Browser → Blockchain):
- The frontend uses **`ethers.BrowserProvider`** (MetaMask) to call `issueCertificate()` directly on the smart contract
- The issuer's wallet signs the transaction — the private key **never leaves the browser**
- The transaction is mined on Polygon Amoy

**Step 3 — Confirm** (`POST /api/certificates/issue/confirm`):
- After the transaction is confirmed on-chain, the frontend sends `{ certId, txHash }` to the backend
- **Only now** is the MongoDB record created — preventing "ghost" certificates from rejected MetaMask transactions

### 2. Certificate Verification Flow

Anyone can verify a certificate without logging in:

```
  Verifier                  Backend                   Blockchain        IPFS
     │                         │                          │               │
     │── GET /verify/:certId ─▶│                          │               │
     │                         │── checkCertificate() ───▶│               │
     │                         │◀── { exists, revoked } ──│               │
     │                         │── getCertificate() ─────▶│               │
     │                         │◀── full cert struct ─────│               │
     │◀── { valid, metadata } ─│                          │               │
```

- Looks up the certificate on-chain by `certId`
- Returns: validity status, issuer address, student address, metadata (name, course, grade), timestamp, and revocation status
- The on-chain data is the **source of truth** — if it's on the blockchain, it's authentic

### 3. Tamper Detection Flow

Two modes of tamper checking:

**Mode A — Certificate ID only** (no file upload):
- Fetches the original PDF from IPFS using the CID stored on-chain
- Computes SHA-256 of the fetched file
- Compares against the hash stored on-chain
- Confirms the IPFS file hasn't been corrupted

**Mode B — Certificate ID + uploaded PDF**:
- Does everything in Mode A, plus:
- Computes SHA-256 of the uploaded file
- Compares uploaded file hash against the IPFS original
- Tells you if the uploaded PDF is byte-for-byte identical to the original

IPFS fetching uses **`Promise.any()`** to race multiple gateways simultaneously, making tamper checks nearly instant.

### 4. Revocation Flow

Admin-only, server-side operation:

```
  Admin (Browser)             Backend                   Blockchain
     │                           │                          │
     │── POST /revoke ──────────▶│                          │
     │   { certId }              │── revokeCertificate() ──▶│
     │                           │   (server signer)        │
     │                           │◀── tx receipt ───────────│
     │                           │── Update MongoDB         │
     │◀── { txHash, success } ──│                          │
```

- Uses a dedicated **server-side signer** (`REVOKE_PRIVATE_KEY`) since revocation is an admin-only action
- Revocation is **permanent and irreversible** on-chain
- All future verification queries will show `revoked: true`

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| **Password Hashing** | bcryptjs with 12 salt rounds (replaces SHA-256) |
| **Frontend Signing** | Private keys never leave the browser (MetaMask) |
| **No Server Private Key for Issuance** | Server only prepares data; signing happens client-side |
| **JWT Startup Guard** | Server crashes immediately if `JWT_SECRET` is missing |
| **Input Validation** | Joi schemas validate all metadata before IPFS/blockchain |
| **IPFS Gateway Racing** | `Promise.any()` across 4+ gateways with `AbortController` |
| **Duplicate Detection** | SHA-256 hash check prevents re-issuing identical PDFs |
| **Reentrancy Protection** | Smart contract uses OpenZeppelin `ReentrancyGuard` |
| **Authorized Issuers** | Only whitelisted wallets can call `issueCertificate()` |

---

## Prerequisites

- **Node.js** 20+ and **npm** 10+
- **MongoDB Atlas** connection string (or local MongoDB)
- **Pinata** account with JWT (free tier: 1GB storage)
- **Alchemy** Polygon Amoy RPC URL (free tier works)
- **MetaMask** browser extension with Amoy test MATIC
- A deployer wallet with Amoy test MATIC for contract deployment

---

## Environment Setup

### 1. Root `.env` (Hardhat deployment)

```env
ALCHEMY_AMOY_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY
DEPLOYER_PRIVATE_KEY=YOUR_DEPLOYER_KEY_WITHOUT_0x
ISSUER_ADDRESS=0xIssuerWalletAddress
CONTRACT_ADDRESS=0xYourDeployedContractAddress
CHAIN_ID=80002
POLYGONSCAN_API_KEY=
```

### 2. Backend `.env`

Copy from `backend/env.example`:

```env
# Blockchain (Polygon Amoy)
ALCHEMY_AMOY_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY
CONTRACT_ADDRESS=0xYourDeployedContractAddress
CHAIN_ID=80002

# Admin revocation key (only needed for revoking certificates)
REVOKE_PRIVATE_KEY=YOUR_REVOKE_PRIVATE_KEY_WITHOUT_0x

# Database
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-url>/<db-name>

# IPFS (Pinata)
PINATA_JWT=YOUR_PINATA_JWT

# Auth
JWT_SECRET=replace_with_a_strong_random_secret
JWT_EXPIRES_IN=8h

# App
PORT=5000
NODE_ENV=development
BACKEND_PUBLIC_URL=http://localhost:5000
VERIFY_BASE_URL=http://localhost:3000/verify
FRONTEND_URL=http://localhost:3000
IPFS_GATEWAY_BASE_URL=https://gateway.pinata.cloud/ipfs

# Admin bootstrap
ADMIN_EMAIL=admin@yovaanai.com
ADMIN_PASSWORD=ChangeThisPassword123!
```

### 3. Frontend `.env.local`

Copy from `frontend/env.example`:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_TX_EXPLORER_URL=https://amoy.polygonscan.com/tx
REACT_APP_CONTRACT_ADDRESS=0xYourDeployedContractAddress
```

> **Important**: `REACT_APP_CONTRACT_ADDRESS` must match `CONTRACT_ADDRESS` in the backend `.env`.

---

## Install Dependencies

```bash
# Root (Hardhat)
npm install

# Backend
cd backend
npm install
cd ..

# Frontend
cd frontend
npm install
cd ..
```

---

## Smart Contract Deployment

### Compile

```bash
npx hardhat compile
```

### Deploy to Polygon Amoy

```bash
npx hardhat run scripts/deploy.js --network amoy
```

After deployment:
1. Copy the deployed contract address into both `backend/.env` and `frontend/.env.local` as `CONTRACT_ADDRESS` / `REACT_APP_CONTRACT_ADDRESS`
2. Authorize the issuer wallet on the contract:

```bash
npx hardhat run scripts/addIssuer.js --network amoy
```

> **Note**: The wallet address connected in MetaMask must be authorized as an issuer on the contract. If the MetaMask wallet differs from the deployer, run `addIssuer` for it too.

---

## Seed Admin User

```bash
cd backend
npm run seed:admin
```

Creates (or updates) an admin user using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`. Passwords are hashed with **bcrypt** (12 salt rounds).

---

## Run Locally

**Terminal 1 — Backend:**

```bash
cd backend
npm run dev     # Uses nodemon for auto-restart
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm start
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000/api |
| Health Check | http://localhost:5000/api/health |

### Frontend Pages

| Route | Page | Auth Required |
|-------|------|:---:|
| `/login` | Admin/issuer login | ❌ |
| `/` | Dashboard | ✅ |
| `/issue` | Issue a new certificate (MetaMask) | ✅ |
| `/certs` | List issued certificates | ✅ |
| `/verify` | Public certificate verification | ❌ |
| `/tamper` | Tamper detection tool | ❌ |
| `/student` | Student certificate history | ❌ |

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `POST` | `/api/auth/login` | ❌ | Log in, returns JWT |
| `POST` | `/api/auth/register` | 🔒 Admin | Create issuer account |
| `GET` | `/api/auth/me` | 🔒 | Current user profile |

### Certificates

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `POST` | `/api/certificates/issue/prepare` | 🔒 | Upload PDF → IPFS, return prep data |
| `POST` | `/api/certificates/issue/confirm` | 🔒 | Save DB record after MetaMask tx |
| `GET` | `/api/certificates` | 🔒 | List certificates (paginated, searchable) |
| `GET` | `/api/certificates/:certId` | 🔒 | Single certificate details |
| `GET` | `/api/certificates/:certId/original-file` | ❌ | Fetch original PDF via IPFS |
| `POST` | `/api/certificates/revoke` | 🔒 | Revoke a certificate on-chain |
| `POST` | `/api/certificates/tamper-check` | ❌ | Compare PDF against original |
| `GET` | `/api/certificates/student/:address` | ❌ | Student's certificate history |

### Verification

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `GET` | `/api/verify/:certId` | ❌ | Public certificate verification |

---

## Smoke Tests

### Health check

```bash
curl http://localhost:5000/api/health
# → {"status":"ok","timestamp":"..."}
```

### Admin login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yovaanai.com","password":"ChangeThisPassword123!"}'
# → {"token":"eyJ...","user":{...}}
```

### Prepare a certificate (API only)

```bash
TOKEN=<JWT_FROM_LOGIN>
curl -X POST http://localhost:5000/api/certificates/issue/prepare \
  -H "Authorization: Bearer $TOKEN" \
  -F "certificate=@/path/to/certificate.pdf" \
  -F "studentAddress=0xStudentWalletAddress" \
  -F "studentName=Arjun Sharma" \
  -F "courseName=Full Stack Development" \
  -F "grade=A+" \
  -F "issueDate=2026-02-18" \
  -F "organizationName=Yovaan AI"
# → {"certId":"YOVAAN-XXXXXXXX","hash":"...","cid":"...","contractAddress":"0x..."}
```

> **Note**: Full issuance requires MetaMask to sign the on-chain transaction. Use the frontend at `/issue` for the complete flow.

### Verify a certificate

```bash
curl http://localhost:5000/api/verify/<CERT_ID>
# → {"valid":true,"metadata":{...},"revoked":false}
```

### Tamper check (cert ID only)

```bash
curl -X POST http://localhost:5000/api/certificates/tamper-check \
  -F "certId=<CERT_ID>"
# → {"authentic":true,"verdict":"✅ Original IPFS file is intact..."}
```

### Revoke a certificate

```bash
curl -X POST http://localhost:5000/api/certificates/revoke \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"certId":"<CERT_ID>"}'
# → {"success":true,"txHash":"0x..."}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `CertReg: Not an authorized issuer` | Your MetaMask wallet isn't authorized. Run `addIssuer` with your wallet address |
| `FATAL: JWT_SECRET not set` | Add `JWT_SECRET` to `backend/.env` |
| `CONTRACT_ADDRESS` missing | Set it in both `backend/.env` and `frontend/.env.local` |
| IPFS upload fails | Verify `PINATA_JWT` has upload scopes. Regenerate if needed |
| Pinata `403 Forbidden` | Token plan/scope issue. Create a fresh JWT with pinning permission |
| `MetaMask is not installed` | Install MetaMask extension in your browser |
| MetaMask wrong network | Switch MetaMask to Polygon Amoy (chain ID `80002`) |
| Login fails after upgrade | Existing SHA-256 passwords don't match bcrypt. Run `npm run seed:admin` |
| MongoDB connection failure | Verify `MONGODB_URI` and network/IP whitelist |

---

## Notes

- This repo is configured for **Polygon Amoy testnet** (chain ID `80002`).
- IPFS upload uses Pinata v3 API with automatic legacy endpoint fallback.
- IPFS fetching races **4 public gateways** simultaneously for speed.
- `.gitignore` excludes `.env` files and `node_modules`.
- If any secrets were shared publicly, rotate them immediately.
- Certificate issuance requires **MetaMask** — the server never holds issuance private keys.
