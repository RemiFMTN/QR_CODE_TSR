const express = require("express");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const qrcode = require("qrcode");
const nodemailer = require("nodemailer");
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

let cachedTransporter = null;

const getBaseUrl = (req) => {
  const envBase = (process.env.PUBLIC_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
};

const getMailer = async () => {
  if (cachedTransporter) return cachedTransporter;

  const host = (process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  if (!host || !port || !user || !pass) return null;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  return cachedTransporter;
};

// (Mailgun removed) -- email providers now: SendGrid (preferred) -> SMTP

// Send via SendGrid (Twilio) API
const sendViaSendGrid = async ({ from, to, subject, text, html }) => {
  const key = (process.env.SENDGRID_API_KEY || '').trim();
  if (!key) throw new Error('SendGrid API key missing');
  const sg = require('@sendgrid/mail');
  sg.setApiKey(key);

  const msg = {
    to: Array.isArray(to) ? to : String(to),
    from: from,
    subject: subject || '',
    text: text || '',
    html: html || ''
  };

  const res = await sg.send(msg);
  // send returns an array of responses
  try {
    const info = res && res[0];
    const id = info && (info.headers && (info.headers['x-message-id'] || info.headers['X-Message-Id'])) || info && info.statusCode;
    return { id, message: 'queued' };
  } catch (e) {
    return { message: 'sent' };
  }
};

// Unified sendMail wrapper: prefer SendGrid, then SMTP
const sendMail = async (opts) => {
  const sendgridConfigured = (process.env.SENDGRID_API_KEY || '').trim();
  if (sendgridConfigured) {
    try {
      const info = await sendViaSendGrid(opts);
      console.log(`[MAIL] SendGrid sent to ${opts.to} id=${info.id || info.message}`);
      return { messageId: info.id || info.message };
    } catch (e) {
      console.error('[MAIL] SendGrid send failed, falling back', e);
    }
  }

  const transporter = await getMailer();
  if (!transporter) throw new Error('No mail transporter configured');
  return transporter.sendMail(opts);
};

const notifyRegistrationByEmail = async ({
  req,
  groupName,
  creatorName,
  creatorEmail,
  fallbackCode,
  qrToken,
  members
}) => {
  const baseUrl = getBaseUrl(req);
  const pdfUrl = `${baseUrl}/public/registration.pdf?token=${encodeURIComponent(qrToken)}`;
  const editUrl = `${baseUrl}/public/edit.html?creatorEmail=${encodeURIComponent(creatorEmail)}&fallbackCode=${encodeURIComponent(fallbackCode)}`;
  const qrDataUrl = await qrcode.toDataURL(qrToken, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 260
  });

  const sendgridConfigured = (process.env.SENDGRID_API_KEY || '').trim();
  const smtpConfigured = (process.env.SMTP_USER || '').trim() && (process.env.SMTP_PASS || '').trim();
  if (!sendgridConfigured && !smtpConfigured) {
    console.log('[LOCAL EMAIL] No mail provider configured (SendGrid or SMTP). Skipping send.');
    console.log('Creator email:', creatorEmail);
    console.log('PDF URL:', pdfUrl);
    console.log('Edit URL:', editUrl);
    return;
  }

  const from = (process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  if (!from) {
    console.log('[LOCAL EMAIL] SENDGRID_FROM/SMTP_FROM/SMTP_USER missing. Skipping send.');
    return;
  }

  const memberList = members
    .map((m, i) => `${i + 1}. ${m.fullName}${m.email ? ` (${m.email})` : ""}`)
    .join("\n");

  const panelStyle = 'background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:18px;margin:18px 0;';
  const buttonStylePrimary = 'background:#0f766e;color:#ffffff;padding:12px 18px;text-decoration:none;border-radius:12px;display:inline-block;font-weight:700;';
  const buttonStyleSecondary = 'background:#ffffff;color:#0f766e;padding:12px 18px;text-decoration:none;border-radius:12px;display:inline-block;font-weight:700;border:1px solid #0f766e;';
  const smallMuted = 'color:#6b7280;font-size:13px;line-height:1.5;';

  // Deduplicate: create a Set of member emails to avoid sending twice if creator is also a member
  const memberEmails = new Set(members.filter(m => m.email).map(m => m.email.toLowerCase()));
  const creatorEmailLower = creatorEmail ? creatorEmail.toLowerCase() : '';

  // ========== EMAIL TO CREATOR (with edit code) ==========
  if (creatorEmail) {
    const creatorText = [
      "INSCRIPTION CONFIRMEE",
      `Groupe : ${groupName}`,
      `Createur : ${creatorName}`,
      "",
      "CODE DE MODIFICATION (à conserver précieusement) :",
      fallbackCode,
      "",
      "QR CODE ET PDF :",
      "Téléchargez le PDF pour conserver le QR code et le code de modification.",
      "",
      "",
      `Telecharger le PDF : ${pdfUrl}`,
      `Modifier le groupe : ${editUrl}`
    ].join("\n");

    const creatorHtml = `
      <div style="font-family: Arial, sans-serif; color:#1f2937; background:#f8fafc; padding:24px; border-radius:18px;">
        <h2 style="margin:0 0 8px; color:#0f766e;">Inscription confirmée</h2>
        <p style="margin:0 0 18px; ${smallMuted}">Votre groupe est prêt. Le QR code est affiché ci-dessous et le PDF contient la version complète à conserver.</p>

        <div style="${panelStyle}">
          <p style="margin:0 0 6px; font-size:14px; color:#6b7280; text-transform:uppercase; letter-spacing:.06em; font-weight:700;">Groupe</p>
          <p style="margin:0; font-size:18px; font-weight:700;">${groupName}</p>
          <p style="margin:6px 0 0; ${smallMuted}">Créateur : ${creatorName}</p>
        </div>

        <div style="${panelStyle}; background:#fff7ed; border-color:#fdba74; text-align:center;">
          <p style="margin:0 0 8px; font-size:14px; font-weight:700; color:#9a3412;">Code de modification à conserver précieusement</p>
          <div style="font-size:30px; font-weight:800; letter-spacing:6px; color:#b45309; margin-bottom:14px;">${fallbackCode}</div>
          <a href="${editUrl}" style="${buttonStyleSecondary}">Modifier le groupe</a>
        </div>

        <div style="${panelStyle}; text-align:center;">
          <p style="margin:0 0 12px; font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#6b7280;">QR code d’accès</p>
          <img src="${qrDataUrl}" alt="QR code" style="width:220px; max-width:100%; border:8px solid #ffffff; border-radius:18px; box-shadow:0 10px 30px rgba(15,23,42,.12); background:#fff;" />
          <p style="margin:14px 0 0; ${smallMuted}">Téléchargez aussi le PDF pour garder une copie imprimable avec le QR code et le code de modification.</p>
        </div>

        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:18px;">
          <a href="${pdfUrl}" style="${buttonStylePrimary}">Télécharger le PDF</a>
          <a href="${editUrl}" style="${buttonStyleSecondary}">Modifier le groupe</a>
        </div>
      </div>
    `;

    try {
      const info = await sendMail({ from, to: creatorEmail, subject: `Inscription TSR - ${groupName} (CODE MODIFICATION)`, text: creatorText, html: creatorHtml });
      console.log(`[MAIL] Sent to creator ${creatorEmail} messageId=${info && (info.messageId || info.message || info.id)}`);
    } catch (e) {
      console.error('[MAIL] Failed to send to creator', creatorEmail, e);
    }
  }

  // ========== EMAIL TO MEMBERS (without edit code) ==========
  // Skip creator if they're also in the members list (already sent creator email with code)
  for (const member of members) {
    if (member.email && member.email.toLowerCase() !== creatorEmailLower) {
      const memberText = [
        "INSCRIPTION CONFIRMEE",
        `Groupe : ${groupName}`,
        `Createur : ${creatorName}`,
        "",
        "Vous avez ete ajoute aux participants.",
        "",
        "Scannez le QR code ci-dessous ou téléchargez le PDF pour conserver votre QR code.",
        "",
        `Telecharger le PDF : ${pdfUrl}`
      ].join("\n");

      const memberHtml = `
        <div style="font-family: Arial, sans-serif; color:#1f2937; background:#f8fafc; padding:24px; border-radius:18px;">
          <h2 style="margin:0 0 8px; color:#0f766e;">Invitation envoyée</h2>
          <p style="margin:0 0 18px; ${smallMuted}">Vous avez été ajouté au groupe. Le QR code est visible ci-dessous ; le PDF reste la version la plus pratique à conserver.</p>

          <div style="${panelStyle}">
            <p style="margin:0 0 6px; font-size:14px; color:#6b7280; text-transform:uppercase; letter-spacing:.06em; font-weight:700;">Groupe</p>
            <p style="margin:0; font-size:18px; font-weight:700;">${groupName}</p>
            <p style="margin:6px 0 0; ${smallMuted}">Créateur : ${creatorName}</p>
          </div>

          <div style="${panelStyle}; text-align:center;">
            <p style="margin:0 0 12px; font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#6b7280;">QR code d’accès</p>
            <img src="${qrDataUrl}" alt="QR code" style="width:220px; max-width:100%; border:8px solid #ffffff; border-radius:18px; box-shadow:0 10px 30px rgba(15,23,42,.12); background:#fff;" />
            <p style="margin:14px 0 0; ${smallMuted}">Téléchargez le PDF pour conserver le QR code en version imprimable ou hors ligne.</p>
          </div>

          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:18px;">
            <a href="${pdfUrl}" style="${buttonStylePrimary}">Télécharger le PDF</a>
          </div>
        </div>
      `;

      try {
        const info = await sendMail({ from, to: member.email, subject: `Inscription TSR - ${groupName}`, text: memberText, html: memberHtml });
        console.log(`[MAIL] Sent to member ${member.email} messageId=${info && (info.messageId || info.message || info.id)}`);
      } catch (e) {
        console.error('[MAIL] Failed to send to member', member.email, e);
      }
    }
  }
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
    `attachment; filename="inscription-${group.name.replace(/\s+/g, "-")}.pdf"`
  );

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(20).text("Inscription a l'evenement", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Groupe : ${group.name}`);
  doc.text(`Createur : ${group.creator_name}`);
  doc.moveDown(0.5);

  doc.image(qrPng, { fit: [180, 180] });
  doc.moveDown(0.5);
  doc.text(`Code QR : ${group.qr_token}`);

  doc.moveDown();
  doc.fontSize(14).text("Membres", { underline: true });
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

  try {
    await notifyRegistrationByEmail({
      req,
      groupName,
      creatorName,
      creatorEmail,
      fallbackCode,
      qrToken,
      members: createdMembers
    });
  } catch (mailError) {
    console.error("Email notification failed", mailError);
  }

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

  const group = await get('SELECT id, name, creator_name, creator_email, qr_token, fallback_code FROM groups WHERE id = ?', [id]);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  if (email) {
    const existingByEmail = await get(
      'SELECT id FROM members WHERE group_id = ? AND LOWER(email) = LOWER(?)',
      [id, email]
    );
    if (existingByEmail) {
      return res.status(409).json({ error: 'Member email already exists in this group' });
    }
  }

  const memberId = uuidv4();
  await run('INSERT INTO members (id, group_id, full_name, email) VALUES (?, ?, ?, ?)', [memberId, id, fullName, email || null]);

  if (email && group.creator_email && email.toLowerCase() !== String(group.creator_email).toLowerCase()) {
    try {
      const baseUrl = getBaseUrl(req);
      const pdfUrl = `${baseUrl}/public/registration.pdf?token=${encodeURIComponent(group.qr_token)}`;
      const memberText = [
        'INSCRIPTION CONFIRMEE',
        `Groupe : ${group.name}`,
        `Createur : ${group.creator_name}`,
        '',
        'Vous avez ete ajoute aux participants.',
        '',
        `Telecharger le PDF : ${pdfUrl}`
      ].join('\n');

      const memberHtml = `
        <p><strong>INSCRIPTION CONFIRMEE</strong></p>
        <p>Groupe : ${group.name}<br />
        Createur : ${group.creator_name}</p>
        <p>Vous avez ete ajoute aux participants.</p>
        <p>
          <a href="${pdfUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Telecharger le PDF</a>
        </p>
      `;

      const from = (process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
      if (from) {
        const info = await sendMail({ from, to: email, subject: `Inscription TSR - ${group.name}`, text: memberText, html: memberHtml });
        console.log(`[MAIL] Sent new-member email to ${email} messageId=${info && (info.messageId || info.message || info.id)}`);
      } else {
        console.log('[MAIL] No from address configured, skipped new-member email for', email);
      }
    } catch (e) {
      console.error('[MAIL] Failed to send new-member email', email, e);
    }
  }

  return res.status(201).json({ id: memberId, fullName, email: email || null });
});

// Public delete member
router.delete('/groups/:id/members/:memberId', async (req, res) => {
  const { id, memberId } = req.params;
  const member = await get('SELECT id FROM members WHERE id = ? AND group_id = ?', [memberId, id]);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  
  // First delete all event_logs associated with this member (foreign key constraint)
  await run('DELETE FROM event_logs WHERE member_id = ?', [memberId]);
  
  // Then delete the member
  await run('DELETE FROM members WHERE id = ?', [memberId]);
  return res.json({ ok: true });
});

module.exports = router;
