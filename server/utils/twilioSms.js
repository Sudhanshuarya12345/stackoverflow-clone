import twilio from "twilio";

const getClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken || !process.env.TWILIO_FROM_NUMBER) {
    throw new Error(
      "Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER missing)"
    );
  }
  return twilio(accountSid, authToken);
};

export const sendSms = async (toPhone, body) => {
  const client = getClient();
  const message = await client.messages.create({
    to: toPhone,
    from: process.env.TWILIO_FROM_NUMBER,
    body,
  });
  console.log("Password reset SMS sent:", message.sid, "status:", message.status);
  return message;
};
