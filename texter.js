require("dotenv").config();
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;

const twilio = require("twilio");

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const sendText = async (body, to) => {
  const from = TWILIO_FROM_NUMBER;

  return await twilioClient.messages.create({ from, to, body });
};

module.exports = { sendText };