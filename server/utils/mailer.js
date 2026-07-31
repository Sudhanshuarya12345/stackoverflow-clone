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
  } catch (error) {
    console.error("Error sending subscription email:", error);
  }
};
