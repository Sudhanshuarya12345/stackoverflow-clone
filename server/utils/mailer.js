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

export const sendSubscriptionEmail = async (toEmail, planName, invoiceNumber, pdfBuffer) => {
  try {
    const transporter = getTransporter();
    
    const mailOptions = {
      from: `"StackOverflow Clone" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: `Subscription Confirmation - ${planName} Plan`,
      text: `Thank you for subscribing to the ${planName} plan! Your invoice (${invoiceNumber}) is attached.`,
      html: `<p>Thank you for subscribing to the <strong>${planName}</strong> plan!</p><p>Your invoice (${invoiceNumber}) is attached to this email.</p>`,
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
