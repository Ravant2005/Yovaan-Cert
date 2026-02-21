import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "issuer"],
      default: "issuer",
    },
    walletAddress: {
      type: String,
      lowercase: true,
    },
    organizationName: String,
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Hash password before saving — bcrypt adds a unique salt per hash automatically
UserSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next();
  try {
    this.passwordHash = await bcrypt.hash(this.passwordHash, BCRYPT_ROUNDS);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare a plaintext password against the stored bcrypt hash
UserSchema.methods.checkPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

export default mongoose.model("User", UserSchema);
