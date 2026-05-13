const express = require("express");
const crypto = require("crypto");
const { all, get, run, uuidv4 } = require("../db");

const router = express.Router();

const createQrToken = () => crypto.randomBytes(24).toString("hex");
const createFallbackCode = () => ("" + Math.floor(100000 + Math.random() * 900000));

router.get("/", async (req, res) => {
  const groups = await all("SELECT * FROM groups ORDER BY created_at DESC");
  return res.json(groups);
});

router.get("/search", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!query) return res.json([]);

  const like = `%${query.toLowerCase()}%`;
  const results = await all(
    `SELECT
      g.id as group_id,
      g.name as group_name,
      g.creator_name,
      g.qr_token,
      g.fallback_code,
      m.id as member_id,
      m.full_name,
      m.email,
      m.checked_in
    FROM groups g
    JOIN members m ON m.group_id = g.id
    WHERE LOWER(g.name) LIKE ?
       OR LOWER(m.full_name) LIKE ?
       OR LOWER(COALESCE(m.email, '')) LIKE ?
    ORDER BY g.name ASC, m.full_name ASC`,
    [like, like, like]
  );

  return res.json(results);
});

router.get("/:id", async (req, res) => {
  const group = await get("SELECT * FROM groups WHERE id = ?", [req.params.id]);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const members = await all("SELECT * FROM members WHERE group_id = ? ORDER BY created_at ASC", [group.id]);
  return res.json({ group, members });
});

router.post("/", async (req, res) => {
  const { name, creatorName } = req.body || {};
  if (!name || !creatorName) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const id = uuidv4();
  const qrToken = createQrToken();
  const fallbackCode = createFallbackCode();

  await run(
    "INSERT INTO groups (id, name, creator_name, qr_token, fallback_code) VALUES (?, ?, ?, ?, ?)",
    [id, name, creatorName, qrToken, fallbackCode]
  );

  return res.status(201).json({ id, name, creatorName, qrToken, fallbackCode });
});

router.post("/:id/members", async (req, res) => {
  const { fullName, email } = req.body || {};
  if (!fullName) {
    return res.status(400).json({ error: "Missing fullName" });
  }

  const group = await get("SELECT id FROM groups WHERE id = ?", [req.params.id]);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const id = uuidv4();
  await run(
    "INSERT INTO members (id, group_id, full_name, email) VALUES (?, ?, ?, ?)",
    [id, group.id, fullName, email || null]
  );

  return res.status(201).json({ id, groupId: group.id, fullName, email: email || null });
});

module.exports = router;
