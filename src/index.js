const { SECRETS } = process.env;
if (SECRETS) {
  try {
    const secrets = JSON.parse(SECRETS.replace(/\n/g, ""));
    Object.keys(secrets).forEach((key) => {
      process.env[key] = secrets[key];
    });
  } catch (e) {
    console.error("Error parsing SECRETS JSON", e);
  }
}

const express = require("express");

const {
  gcpLogTransformer,
  requestLogger,
  authAPIRequest,
  serverErrorHandler,
} = require("@davidlwatsonjr/microservice-middleware");
const { send: sendToTwilio } = require("./controllers/twilio");

const app = express();
app.disable("x-powered-by");

const exploitProbePatterns = [
  /\.(?:php\d*|phtml|phar|asp|aspx|ashx|asmx|jsp|jspx|cgi|pl|cfm|cfc)(?:\/|$)/i,
  /(?:^|\/)\.env(?:\.|$)/i,
  /^\/\.git(?:\/|$)/i,
  /^\/\.aws(?:\/|$)/i,
  /(?:^|\/)phpinfo(?:\/|$)/i,
  /^\/wp-(?:admin|content|includes)(?:\/|$)/i,
  /^\/phpmyadmin(?:\/|$)/i,
  /^\/pma(?:\/|$)/i,
  /^\/vendor\/phpunit(?:\/|$)/i,
  /^\/server-status(?:\/|$)/i,
  /^\/actuator(?:\/|$)/i,
  /^\/cgi-bin(?:\/|$)/i,
];

app.use((req, res, next) => {
  if (!exploitProbePatterns.some((pattern) => pattern.test(req.path))) {
    return next();
  }

  return res
    .status(403)
    .set({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    })
    .send("Exploit probe, huh?\n\nGood luck. 🖕\n");
});

app.use(gcpLogTransformer);
app.use(requestLogger);

app.get("/ping", async (req, res) => {
  res.send("pong");
});

app.use(authAPIRequest("TEXTER"));

app.get("/twilio/send", sendToTwilio);
app.get("/send", sendToTwilio);

app.use(serverErrorHandler);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(
    `The texter app started successfully and is listening for HTTP requests on ${PORT}`,
  );
});
