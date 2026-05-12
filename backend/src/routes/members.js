const express = require("express");
const { get, run, uuidv4 } = require("../db");

const router = express.Router();

router.patch("/:id", async (req, res) => {
  const { checkedIn } = req.body || {};
  if (typeof checkedIn !== "boolean") {
    return res.status(400).json({ error: "checkedIn must be boolean" });
  }

  const member = await get("SELECT id, group_id, checked_in FROM members WHERE id = ?", [req.params.id]);
  if (!member) return res.status(404).json({ error: "Member not found" });

  await run(
    "UPDATE members SET checked_in = ?, checked_in_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?",
    [checkedIn ? 1 : 0, checkedIn ? 1 : 0, member.id]
  );

  await run(
    "INSERT INTO event_logs (id, group_id, member_id, event_type, meta_json) VALUES (?, ?, ?, ?, ?)",
    [uuidv4(), member.group_id, member.id, checkedIn ? "check_in" : "check_out", null]
  );

  return res.json({ id: member.id, checkedIn });
});

module.exports = router;
