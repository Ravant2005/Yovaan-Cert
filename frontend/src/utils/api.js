import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "/api",
  timeout: 60000,
});

// Attach JWT token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth ─────────────────────────────────────────────────
export const login = (email, password) =>
  api.post("/auth/login", { email, password });

// ── Certificates ─────────────────────────────────────────
export const issueCertificate = (formData) =>
  api.post("/certificates/issue", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const listCertificates = (params) =>
  api.get("/certificates", { params });

export const getCertificate = (certId) =>
  api.get(`/certificates/${certId}`);

export const revokeCertificate = (certId, reason) =>
  api.post("/certificates/revoke", { certId, reason });

export const tamperCheck = (formData) =>
  api.post("/certificates/tamper-check", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const getStudentHistory = (address) =>
  api.get(`/certificates/student/${address}`);

// ── Public Verify (no auth) ───────────────────────────────
export const verifyCertificate = (certId) =>
  api.get(`/verify/${certId}`);
