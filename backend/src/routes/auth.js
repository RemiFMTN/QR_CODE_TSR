const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { get } = require("../db");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const admin = await get("SELECT id, username, password_hash FROM admins WHERE username = ?", [username]);
  if (!admin) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { sub: admin.id, username: admin.username },
    process.env.JWT_SECRET || "",
    { expiresIn: "12h" }
  );

  return res.json({ token });
});

module.exports = router;
