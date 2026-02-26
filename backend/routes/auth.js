import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { protect, adminOnly } from "../middleware/auth.js";
import dotenv from "dotenv";
dotenv.config();

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  const user = await User.findOne({ email, active: true });
  if (!user || !(await user.checkPassword(password)))
    return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );

  res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
      organizationName: user.organizationName,
    },
  });
});

// POST /api/auth/register  (admin only — creates new issuer accounts)
router.post("/register", protect, adminOnly, async (req, res) => {
  const { email, password, walletAddress, organizationName, role } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  const existing = await User.findOne({ email });
  if (existing)
    return res.status(409).json({ error: "Email already registered" });

  const user = new User({
    email,
    passwordHash: password, // pre-save hook hashes it
    walletAddress,
    organizationName,
    role: role || "issuer",
  });
  await user.save();

  res.status(201).json({ message: "Issuer account created", userId: user._id });
});

// GET /api/auth/me
router.get("/me", protect, async (req, res) => {
  const user = await User.findById(req.userId).select("-passwordHash");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

export default router;
