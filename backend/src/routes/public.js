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

  const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const buildEmailButton = (href, label, backgroundColor) => `
    <a href="${href}" style="display:inline-block;background:${backgroundColor};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;line-height:1;">${label}</a>
  `;

const buildEmailShell = ({ title, intro, body, footer }) => `
  <div style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:0 auto;">
      <div style="background:#f8f9fa;padding:28px 32px;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:12px;letter-spacing:1.6px;text-transform:uppercase;margin-bottom:8px;">TSR</div>
        <h1 style="margin:0;font-size:24px;line-height:1.2;margin-bottom:12px;">${title}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;">${intro}</p>
      </div>

      <div style="padding:30px 32px;">
        ${body}
        <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;">
          ${footer}
        </div>
      </div>
    </div>
  </div>
`;

  const memberItemsHtml = members
    .map((m, i) => `
      <li style="margin:0 0 10px;">${escapeHtml(m.fullName)}${m.email ? ` <span style="color:#6b7280;">(${escapeHtml(m.email)})</span>` : ""}</li>
    `)
    .join("");

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
      "CODE DE MODIFICATION (A conserver precieusement) :",
      fallbackCode,
      "",
      "Membres :",
      memberList,
      "",
      `Telecharger le PDF : ${pdfUrl}`
    ].join("\n");

    const creatorHtml = buildEmailShell({
      title: "Inscription confirmee",
      intro: `Votre groupe <strong>${escapeHtml(groupName)}</strong> a ete enregistre. Vous trouverez ci-dessous le code de modification et les informations utiles.`,
      body: `
        <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:14px;padding:18px 20px;margin-bottom:22px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#9a3412;margin-bottom:8px;">Code de modification</div>
          <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:#c2410c;word-break:break-all;">${escapeHtml(fallbackCode)}</div>
          <div style="margin-top:8px;font-size:13px;color:#7c2d12;">A conserver precieusement pour modifier le groupe plus tard.</div>
        </div>

        <div style="background:#fef2f2;border:2px solid #ef4444;border-left:8px solid #dc2626;border-radius:14px;padding:18px 20px;margin-bottom:22px;box-shadow:0 6px 18px rgba(220,38,38,0.12);">
          <div style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#991b1b;margin-bottom:10px;">Information importante</div>
          <div style="font-size:15px;line-height:1.7;color:#7f1d1d;font-weight:700;">
            Si vous devez modifier votre groupe, contactez la personne qui vous a inscrite a l'evenement, et transmettez-lui le mail fourni lors de la creation du groupe, ainsi que le code recu dans ce mail, et lors de la confirmation de l'inscription.
          </div>
        </div>

        <div style="margin-bottom:22px;">
          <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;">Informations du groupe</div>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px 18px;line-height:1.7;">
            <div><strong>Groupe :</strong> ${escapeHtml(groupName)}</div>
            <div><strong>Créateur :</strong> ${escapeHtml(creatorName)}</div>
          </div>
        </div>

        <div style="margin-bottom:22px;">
          <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;">Membres</div>
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:16px 18px;">
            <ol style="margin:0;padding-left:20px;line-height:1.8;">${memberItemsHtml}</ol>
          </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          ${buildEmailButton(pdfUrl, "Télécharger le PDF", "#2563eb")}
        </div>
      `,
      footer: `Si les boutons ne fonctionnent pas, vous pouvez utiliser ces liens :<br />PDF : ${escapeHtml(pdfUrl)}<br />Modification : ${escapeHtml(editUrl)}`
    });

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
        "Vous avez ete ajoute aux participants de la Garden party de TSR Industrie !",
        "",
        "Telechargez le PDF de confirmation ci-dessous contenant le QR code d'acces, et presentez-le à l'entree de l'evenement.",
        "Si vous avez des questions, n'hesitez pas à contacter le createur du groupe.",
        `Telecharger le PDF : ${pdfUrl}`
      ].join("\n");

      const memberHtml = buildEmailShell({
        title: "Inscription confirmee",
        intro: `Vous avez ete ajoute au groupe <strong>${escapeHtml(groupName)}</strong>.`,
        body: `
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px 18px;line-height:1.8;margin-bottom:22px;">
            <div><strong>Groupe :</strong> ${escapeHtml(groupName)}</div>
            <div><strong>Createur :</strong> ${escapeHtml(creatorName)}</div>
          </div>

          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:18px 20px;margin-bottom:22px;">
            <div style="font-size:14px;font-weight:700;color:#1d4ed8;margin-bottom:6px;">Participation enregistree</div>
            <div style="font-size:14px;line-height:1.7;color:#1e3a8a;">Vous avez ete ajoute aux participants. Le PDF de confirmation est disponible ci-dessous.</div>
            <div style="font-size:14px;color:#1e3a8a;font-weight:700;">Telechargez le PDF contenant le QR code d'acces a presenter lors de votre arrivee.</div>
          </div>

          ${buildEmailButton(pdfUrl, "Telecharger le PDF", "#2563eb")}
        `,
        footer: `Si le bouton ne fonctionne pas, ouvrez ce lien : ${escapeHtml(pdfUrl)}`
      });

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
