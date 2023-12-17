require("dotenv").config();

const { sendText } = require("../lib/twilio");

const [, , to, ...rest] = process.argv;
const body = rest.join(" ");

console.log(`Texting ${to}: ${body}`);

(async () => {
  try {
    await sendText(body, to);
  } catch (error) {
    console.error(
      `Error occurred sending text: [${error.status}] - ${error.message}`
    );
  }
})();
