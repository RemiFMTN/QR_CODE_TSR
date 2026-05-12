require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const authMiddleware = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const groupRoutes = require("./routes/groups");
const memberRoutes = require("./routes/members");
const scanRoutes = require("./routes/scan");
const publicRoutes = require("./routes/public");
const { initSchema, ensureAdmin } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/groups", authMiddleware, groupRoutes);
app.use("/members", authMiddleware, memberRoutes);
app.use("/scan", authMiddleware, scanRoutes);
app.use("/public", publicRoutes);
app.use("/public", express.static(path.join(__dirname, "..", "public")));

const start = async () => {
  await initSchema();

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("Missing ADMIN_USERNAME or ADMIN_PASSWORD in env");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await ensureAdmin(username, passwordHash);

  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
};

start().catch((err) => {
  console.error("Failed to start", err);
  process.exit(1);
});
