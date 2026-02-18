import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";

dotenv.config();

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required in backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    user = new User({
      email,
      passwordHash: password,
      role: "admin",
      active: true,
      organizationName: "Yovaan AI",
    });
    await user.save();
    console.log(`Created admin user: ${email}`);
  } else {
    user.passwordHash = password;
    user.role = "admin";
    user.active = true;
    if (!user.organizationName) user.organizationName = "Yovaan AI";
    await user.save();
    console.log(`Updated admin user: ${email}`);
  }

  await mongoose.disconnect();
}

seedAdmin()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("Admin seed failed:", error.message);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors on failure path
    }
    process.exit(1);
  });
