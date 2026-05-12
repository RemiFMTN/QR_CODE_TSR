const express = require("express");
const { all, get } = require("../db");

const router = express.Router();

router.post("/qr", async (req, res) => {
  const { qrToken, fallbackCode } = req.body || {};
  if (!qrToken && !fallbackCode) {
    return res.status(400).json({ error: "qrToken or fallbackCode required" });
  }

  const group = await get(
    "SELECT * FROM groups WHERE qr_token = ? OR fallback_code = ?",
    [qrToken || "", fallbackCode || ""]
  );

  if (!group) return res.status(404).json({ error: "Group not found" });

  const members = await all("SELECT * FROM members WHERE group_id = ? ORDER BY created_at ASC", [group.id]);
  return res.json({ group, members });
});

router.post("/checkin", async (req, res) => {
  return res.status(400).json({ error: "Use PATCH /members/:id for check-in" });
});

module.exports = router;
