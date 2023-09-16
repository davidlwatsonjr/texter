const twilio = require("twilio");

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } =
  process.env;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const from = TWILIO_FROM_NUMBER;

const sendText = async (body, to) =>
  await twilioClient.messages.create({ from, to, body });

module.exports = { sendText };
