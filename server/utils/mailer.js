import nodemailer from "nodemailer";

const getTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, 
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export const sendSubscriptionEmail = async (toEmail, planName, invoiceNumber, pdfBuffer, details = {}) => {
  try {
    const transporter = getTransporter();
    
    const mailOptions = {
      from: `"StackOverflow Clone" <${process.env.SMTP_USER}>`,
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
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Invoice email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending subscription email:", error);
    return false;
  }
};

export const sendPasswordResetEmail = async (toEmail, password) => {
  try {
    const transporter = getTransporter();
    const mailOptions = {
      from: `"StackOverflow Clone" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: "Your password has been reset",
      text: `Your new password is: ${password}\nPlease log in with this password and change it after logging in.`,
      html: `<p>Your new password is: <strong>${password}</strong></p><p>Please log in with this password and change it after logging in.</p>`,
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Password reset email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return false;
  }
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const sendMail = async ({ to, subject, text, html }) => {
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: `"StackOverflow Clone" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`Email "${subject}" sent:`, info.messageId);
    return true;
  } catch (error) {
    console.error(`Error sending email "${subject}":`, error.message);
    return false;
  }
};

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
