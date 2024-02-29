require("dotenv").config();

const { sendText } = require("../lib/twilio");

const [, , to, ...rest] = process.argv;
const body = rest.join(" ");

if (!to || !body) {
  console.error("Usage: text <to> <message>");
  process.exit(1);
}

console.log(`Texting ${to}: ${body}`);

(async () => {
  try {
    await sendText(body, to);
  } catch (error) {
    console.error(
      `Error occurred sending text: [${error.status}] - ${error.message}`,
    );
  }
})();
