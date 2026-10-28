import nodemailer from "nodemailer";
import { emailText, formatDateFor, formatDateTimeFor } from "../i18n/index.js";

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

// The email helpers below take the recipient's language (user.language) and fall back to English.
export const sendSubscriptionEmail = async (toEmail, planName, invoiceNumber, pdfBuffer, details = {}) => {
  const lang = details.lang;
  const t = (key, vars) => emailText(lang, key, vars);
  const features = (details.features || []).map((feature) => t(feature));
  const periodEnd = details.periodEnd ? formatDateFor(lang, details.periodEnd, { dateStyle: "long" }) : "";
  return sendMail({
    to: toEmail,
    subject: t("sub.subject", { plan: planName }),
    text: [
      t("sub.thanks", { plan: planName }),
      details.amount ? t("sub.amount", { amount: details.amount }) : "",
      periodEnd ? t("sub.renews", { date: periodEnd }) : "",
      features.length ? `${t("sub.included")} ${features.join(", ")}` : "",
      t("sub.invoice", { invoice: invoiceNumber }),
    ].filter(Boolean).join("\n"),
    html: `<p>${t("sub.thanks", { plan: `<strong>${escapeHtml(planName)}</strong>` })}</p>
        ${details.amount ? `<p>${t("sub.amount", { amount: `<strong>${escapeHtml(details.amount)}</strong>` })}</p>` : ""}
        ${periodEnd ? `<p>${t("sub.renews", { date: `<strong>${escapeHtml(periodEnd)}</strong>` })}</p>` : ""}
        ${features.length ? `<p>${t("sub.included")}</p><ul>${features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
        <p>${t("sub.invoice", { invoice: escapeHtml(invoiceNumber) })}</p>`,
    attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
  });
};

export const sendPasswordResetEmail = async (toEmail, password, lang) => {
  const t = (key, vars) => emailText(lang, key, vars);
  return sendMail({
    to: toEmail,
    subject: t("reset.subject"),
    text: `${t("reset.password", { password })}\n${t("reset.change")}`,
    html: `<p>${t("reset.password", { password: `<strong>${escapeHtml(password)}</strong>` })}</p><p>${t("reset.change")}</p>`,
  });
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export const otpPurposeText = (purpose, lang) =>
  emailText(lang, ["login", "language", "reset"].includes(purpose) ? `otp.purpose.${purpose}` : "otp.purpose.default");

export const sendOtpEmail = async (toEmail, code, purpose, lang) => {
  const t = (key, vars) => emailText(lang, key, vars);
  const action = otpPurposeText(purpose, lang);
  return sendMail({
    to: toEmail,
    subject: t("otp.subject", { code }),
    text: `${t("otp.use", { code, action })} ${t("otp.expires")}`,
    html: `<p>${t("otp.use", { code: `<strong style="font-size:18px;letter-spacing:2px">${code}</strong>`, action })}</p><p>${t("otp.expires")}</p>`,
  });
};

export const sendNewDeviceLoginEmail = async (toEmail, info, lang) => {
  const t = (key, vars) => emailText(lang, key, vars);
  const rows = [
    [t("device.browser"), info.browser],
    [t("device.os"), info.os],
    [t("device.type"), info.deviceType],
    [t("device.ip"), info.ip || t("device.unknown")],
    [t("device.location"), info.location || t("device.unknown")],
    [t("device.time"), formatDateTimeFor(lang, new Date())],
  ];
  return sendMail({
    to: toEmail,
    subject: t("device.subject"),
    text: `${t("device.intro")}\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n${t("device.warning")}`,
    html: `<p>${t("device.intro")}</p><table>${rows
      .map(([k, v]) => `<tr><td style="padding-right:12px;color:#555">${k}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`)
      .join("")}</table><p>${t("device.warning")}</p>`,
  });
};
