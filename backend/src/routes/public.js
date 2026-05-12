const express = require("express");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const qrcode = require("qrcode");
const { all, get, run, uuidv4, db } = require("../db");

const router = express.Router();

const createQrToken = () => crypto.randomBytes(24).toString("hex");
const createFallbackCode = () => ("" + Math.floor(100000 + Math.random() * 900000));

const parseCloseDate = () => {
  const value = process.env.REGISTRATION_CLOSE_AT;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "invalid";
  return date;
};

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeMembers = (members) => {
  if (!Array.isArray(members)) return [];
  return members
    .map((member) => ({
      fullName: normalizeString(member.fullName),
      email: normalizeString(member.email)
    }))
    .filter((member) => member.fullName.length > 0);
};

const logRegistrationEmail = ({
  groupName,
  creatorName,
  creatorEmail,
  fallbackCode,
  qrToken,
  members
}) => {
  const recipients = new Set();
  if (creatorEmail) recipients.add(creatorEmail);
  members.forEach((member) => {
    if (member.email) recipients.add(member.email);
  });

  console.log("[LOCAL EMAIL] Registration confirmation");
  console.log("Recipients:", Array.from(recipients));
  console.log("Group:", groupName);
  console.log("Creator:", creatorName);
  console.log("QR token:", qrToken);
  console.log("Fallback code:", fallbackCode);
};

router.get("/qr", async (req, res) => {
  const value = typeof req.query.value === "string" ? req.query.value.trim() : "";
  if (!value) {
    return res.status(400).json({ error: "Missing value" });
  }

  try {
    const png = await qrcode.toBuffer(value, {
      type: "png",
      margin: 1,
      width: 240
    });
    res.setHeader("Content-Type", "image/png");
    return res.send(png);
  } catch (err) {
    console.error("Failed to render QR", err);
    return res.status(500).json({ error: "Failed to render QR" });
  }
});

router.get("/registration.pdf", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  const group = await get("SELECT * FROM groups WHERE qr_token = ?", [token]);
  if (!group) {
    return res.status(404).json({ error: "Group not found" });
  }

  const members = await all(
    "SELECT full_name, email FROM members WHERE group_id = ? ORDER BY created_at ASC",
    [group.id]
  );

  const qrPng = await qrcode.toBuffer(group.qr_token, {
    type: "png",
    margin: 1,
    width: 220
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="registration-${group.name.replace(/\s+/g, "-")}.pdf"`
  );

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(20).text("Event registration", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Group: ${group.name}`);
  doc.text(`Creator: ${group.creator_name}`);
  doc.text(`Fallback code: ${group.fallback_code}`);
  doc.moveDown(0.5);

  doc.image(qrPng, { fit: [180, 180] });
  doc.moveDown(0.5);
  doc.text(`QR token: ${group.qr_token}`);

  doc.moveDown();
  doc.fontSize(14).text("Members", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(11);
  members.forEach((member, index) => {
    const email = member.email ? ` (${member.email})` : "";
    doc.text(`${index + 1}. ${member.full_name}${email}`);
  });

  doc.end();
});

router.post("/groups", async (req, res) => {
  const closeDate = parseCloseDate();
  if (closeDate === "invalid") {
    return res.status(500).json({ error: "Invalid REGISTRATION_CLOSE_AT" });
  }
  if (closeDate && new Date() > closeDate) {
    return res.status(403).json({ error: "Registrations are closed" });
  }

  const groupName = normalizeString(req.body?.groupName);
  const creatorName = normalizeString(req.body?.creatorName);
  const creatorEmail = normalizeString(req.body?.creatorEmail);
  const members = normalizeMembers(req.body?.members);

  if (!groupName || !creatorName || !creatorEmail) {
    return res.status(400).json({ error: "Missing groupName, creatorName or creatorEmail" });
  }

  // Ensure the creator is always the first member of the group.
  // If the client didn't send any member rows, add the creator as the first member.
  const creatorMember = { fullName: creatorName, email: creatorEmail };
  const hasCreator = members.some((m) => {
    if (m.email && creatorEmail) return m.email.toLowerCase() === creatorEmail.toLowerCase();
    return m.fullName === creatorName;
  });
  if (!hasCreator) {
    members.unshift(creatorMember);
  }

  const existingGroup = await get("SELECT * FROM groups WHERE creator_email = ?", [creatorEmail]);
  if (existingGroup) {
    const existingMembers = await all(
      "SELECT id, full_name, email FROM members WHERE group_id = ? ORDER BY created_at ASC",
      [existingGroup.id]
    );
    return res.status(200).json({
      group: {
        id: existingGroup.id,
        name: existingGroup.name,
        creatorName: existingGroup.creator_name,
        creatorEmail: existingGroup.creator_email,
        qrToken: existingGroup.qr_token,
        fallbackCode: existingGroup.fallback_code
      },
      members: existingMembers,
      alreadyExists: true
    });
  }

  const groupId = uuidv4();
  const qrToken = createQrToken();
  const fallbackCode = createFallbackCode();

  const createdMembers = [];

  try {
    // If using Postgres pool, use a dedicated client for transaction
    if (db && typeof db.connect === 'function') {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'INSERT INTO groups (id, name, creator_name, creator_email, qr_token, fallback_code) VALUES ($1, $2, $3, $4, $5, $6) ',
          [groupId, groupName, creatorName, creatorEmail, qrToken, fallbackCode]
        );

        for (const member of members) {
          const memberId = uuidv4();
          await client.query(
            'INSERT INTO members (id, group_id, full_name, email) VALUES ($1, $2, $3, $4)',
            [memberId, groupId, member.fullName, member.email || null]
          );
          createdMembers.push({ id: memberId, fullName: member.fullName, email: member.email || null });
        }

        await client.query('COMMIT');
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) { console.error('Rollback failed', e); }
        console.error('Public registration failed', err);
        return res.status(500).json({ error: 'Registration failed' });
      } finally {
        client.release();
      }
    } else {
      // SQLite path (run uses sqlite)
      await run('BEGIN TRANSACTION');
      await run(
        "INSERT INTO groups (id, name, creator_name, creator_email, qr_token, fallback_code) VALUES (?, ?, ?, ?, ?, ?)",
        [groupId, groupName, creatorName, creatorEmail, qrToken, fallbackCode]
      );

      for (const member of members) {
        const memberId = uuidv4();
        await run(
          "INSERT INTO members (id, group_id, full_name, email) VALUES (?, ?, ?, ?)",
          [memberId, groupId, member.fullName, member.email || null]
        );
        createdMembers.push({ id: memberId, fullName: member.fullName, email: member.email || null });
      }

      await run('COMMIT');
    }
  } catch (err) {
    console.error('Public registration failed', err);
    return res.status(500).json({ error: 'Registration failed' });
  }

  logRegistrationEmail({
    groupName,
    creatorName,
    creatorEmail,
    fallbackCode,
    qrToken,
    members: createdMembers
  });

  return res.status(201).json({
    group: {
      id: groupId,
      name: groupName,
      creatorName,
      creatorEmail,
      qrToken,
      fallbackCode
    },
    members: createdMembers
  });
});

// Lookup by fallback code + creator email to allow editing
router.post('/groups/lookup', async (req, res) => {
  const fallback = normalizeString(req.body?.fallbackCode);
  const creatorEmail = normalizeString(req.body?.creatorEmail);
  if (!fallback || !creatorEmail) return res.status(400).json({ error: 'Missing fallbackCode or creatorEmail' });

  const group = await get('SELECT * FROM groups WHERE fallback_code = ? AND creator_email = ?', [fallback, creatorEmail]);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const members = await all('SELECT id, full_name, email FROM members WHERE group_id = ? ORDER BY created_at ASC', [group.id]);

  return res.json({
    group: {
      id: group.id,
      name: group.name,
      creatorName: group.creator_name,
      creatorEmail: group.creator_email,
      qrToken: group.qr_token,
      fallbackCode: group.fallback_code
    },
    members
  });
});

// Update group metadata (name, creator name)
router.put('/groups/:id', async (req, res) => {
  const id = req.params.id;
  const name = normalizeString(req.body?.name);
  const creatorName = normalizeString(req.body?.creatorName);

  const group = await get('SELECT id, name, creator_name FROM groups WHERE id = ?', [id]);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  await run('UPDATE groups SET name = ?, creator_name = ? WHERE id = ?', [name || group.name, creatorName || group.creator_name, id]);
  const updated = await get('SELECT * FROM groups WHERE id = ?', [id]);
  return res.json({ group: { id: updated.id, name: updated.name, creatorName: updated.creator_name, creatorEmail: updated.creator_email, qrToken: updated.qr_token, fallbackCode: updated.fallback_code } });
});

// Public add member to group (edit flow)
router.post('/groups/:id/members', async (req, res) => {
  const id = req.params.id;
  const fullName = normalizeString(req.body?.fullName);
  const email = normalizeString(req.body?.email);
  if (!fullName) return res.status(400).json({ error: 'Missing fullName' });

  const group = await get('SELECT id FROM groups WHERE id = ?', [id]);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const memberId = uuidv4();
  await run('INSERT INTO members (id, group_id, full_name, email) VALUES (?, ?, ?, ?)', [memberId, id, fullName, email || null]);
  return res.status(201).json({ id: memberId, fullName, email: email || null });
});

// Public delete member
router.delete('/groups/:id/members/:memberId', async (req, res) => {
  const { id, memberId } = req.params;
  const member = await get('SELECT id FROM members WHERE id = ? AND group_id = ?', [memberId, id]);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  await run('DELETE FROM members WHERE id = ?', [memberId]);
  return res.json({ ok: true });
});

module.exports = router;
