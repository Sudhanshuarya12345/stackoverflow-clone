import nodemailer from "nodemailer";

const fromName = () => process.env.EMAIL_FROM_NAME || "StackOverflow Clone";
const fromEmail = () => process.env.EMAIL_FROM || process.env.SMTP_USER;

const getTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    // Fail fast instead of hanging the request for minutes when the host blocks SMTP ports.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const toBase64 = (content) =>
  Buffer.isBuffer(content) ? content.toString("base64") : Buffer.from(String(content)).toString("base64");

const sendWithBrevo = async ({ to, subject, text, html, attachments = [] }) => {
  const sender = fromEmail();
  if (!sender) throw new Error("EMAIL_FROM (or SMTP_USER) must be set when using BREVO_API_KEY");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName(), email: sender },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
      // Brevo rejects an empty attachment list, so only send the field when there is something to attach.
      ...(attachments.length
        ? { attachment: attachments.map((file) => ({ name: file.filename, content: toBase64(file.content) })) }
        : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Brevo responded ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  const data = await response.json().catch(() => ({}));
  return data.messageId || "brevo";
};

const sendWithResend = async ({ to, subject, text, html, attachments = [] }) => {
  const sender = fromEmail();
  if (!sender) throw new Error("EMAIL_FROM must be set when using RESEND_API_KEY");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName()} <${sender}>`,
      to: [to],
      subject,
      text,
      html,
      ...(attachments.length
        ? { attachments: attachments.map((file) => ({ filename: file.filename, content: toBase64(file.content) })) }
        : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend responded ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  const data = await response.json().catch(() => ({}));
  return data.id || "resend";
};

const sendWithSmtp = async ({ to, subject, text, html, attachments = [] }) => {
  const info = await getTransporter().sendMail({
    from: `"${fromName()}" <${fromEmail()}>`,
    to,
    subject,
    text,
    html,
    attachments,
  });
  return info.messageId;
};

// Uses an HTTPS email API when a key is configured (required on Render's free
// plan, which blocks outbound SMTP), otherwise falls back to SMTP for local dev.
const sendMail = async (message) => {
  try {
    let id;
    if (process.env.BREVO_API_KEY) id = await sendWithBrevo(message);
    else if (process.env.RESEND_API_KEY) id = await sendWithResend(message);
    else id = await sendWithSmtp(message);
    console.log(`Email "${message.subject}" sent:`, id);
    return true;
  } catch (error) {
    console.error(`Error sending email "${message.subject}":`, error.message);
    return false;
  }
};

export const sendSubscriptionEmail = async (toEmail, planName, invoiceNumber, pdfBuffer, details = {}) => {
  return sendMail({
    to: toEmail,
    subject: `Subscription Confirmation - ${planName} Plan`,
    text: [
      `Thank you for subscribing to the ${planName} plan!`,
      details.amount ? `Amount paid: ${details.amount}` : "",
      details.periodEnd ? `Renews on: ${details.periodEnd}` : "",
      details.features?.length ? `Included: ${details.features.join(", ")}` : "",
      `Your invoice (${invoiceNumber}) is attached.`,
    ].filter(Boolean).join("\n"),
    html: `<p>Thank you for subscribing to the <strong>${planName}</strong> plan!</p>
        ${details.amount ? `<p>Amount paid: <strong>${details.amount}</strong></p>` : ""}
        ${details.periodEnd ? `<p>Renews on: <strong>${details.periodEnd}</strong></p>` : ""}
        ${details.features?.length ? `<p>Included in your plan:</p><ul>${details.features.map((f) => `<li>${f}</li>`).join("")}</ul>` : ""}
        <p>Your invoice (${invoiceNumber}) is attached to this email.</p>`,
    attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
  });
};

export const sendPasswordResetEmail = async (toEmail, password) => {
  return sendMail({
    to: toEmail,
    subject: "Your password has been reset",
    text: `Your new password is: ${password}\nPlease log in with this password and change it after logging in.`,
    html: `<p>Your new password is: <strong>${password}</strong></p><p>Please log in with this password and change it after logging in.</p>`,
  });
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const OTP_PURPOSE_TEXT = {
  login: "verify a login from a new device",
  language: "confirm your language change",
  reset: "reset your password",
};

export const sendOtpEmail = async (toEmail, code, purpose) => {
  const action = OTP_PURPOSE_TEXT[purpose] || "verify your request";
  return sendMail({
    to: toEmail,
    subject: `Your verification code: ${code}`,
    text: `Use ${code} to ${action}. The code expires in 10 minutes. If this wasn't you, ignore this email and change your password.`,
    html: `<p>Use <strong style="font-size:18px;letter-spacing:2px">${code}</strong> to ${action}.</p><p>The code expires in 10 minutes. If this wasn't you, ignore this email and change your password.</p>`,
  });
};

export const sendNewDeviceLoginEmail = async (toEmail, info) => {
  const rows = [
    ["Browser", info.browser],
    ["Operating system", info.os],
    ["Device type", info.deviceType],
    ["IP address", info.ip || "Unknown"],
    ["Location", info.location || "Unknown"],
    ["Time", new Date().toUTCString()],
  ];
  return sendMail({
    to: toEmail,
    subject: "New device login to your account",
    text: `A new device just signed in to your account.\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\nIf this wasn't you, revoke the session from your security settings and change your password.`,
    html: `<p>A new device just signed in to your account.</p><table>${rows
      .map(([k, v]) => `<tr><td style="padding-right:12px;color:#555">${k}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`)
      .join("")}</table><p>If this wasn't you, revoke the session from your security settings and change your password.</p>`,
  });
};
