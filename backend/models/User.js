import mongoose from "mongoose";
import crypto from "crypto";

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

// Hash password before saving
UserSchema.pre("save", function (next) {
  if (!this.isModified("passwordHash")) return next();
  this.passwordHash = crypto
    .createHash("sha256")
    .update(this.passwordHash)
    .digest("hex");
  next();
});

UserSchema.methods.checkPassword = function (password) {
  const hashed = crypto.createHash("sha256").update(password).digest("hex");
  return hashed === this.passwordHash;
};

export default mongoose.model("User", UserSchema);
