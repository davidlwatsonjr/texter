const { sendText } = require("../lib/twilio");

const send = async (req, res) => {
  const { body, to } = req.query;
  const response = { success: false, query: req.query };

  try {
    const info = await sendText(body, to);
    console.log(`Text sent: ${JSON.stringify(info.toJSON())}`);
    response.success = true;
  } catch (error) {
    console.error(
      `Error occurred sending text: [${error.status}] - ${error.message}`
    );
    response.error = error;
    res.status(500);
  }

  res.send(response);
};

module.exports = { send };
