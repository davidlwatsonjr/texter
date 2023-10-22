require("dotenv").config();

const express = require("express");
const { gcpLogTransformer, requestLogger } = require("./middleware/logging");
const { authAPIRequest } = require("./middleware/apiAuth");
const { send: sendToTwilio } = require("./controllers/twilio");

const app = express();

app.use(gcpLogTransformer);
app.use(requestLogger);

app.get("/ping", async (req, res) => {
  res.send("pong");
});

app.use(authAPIRequest);

app.get("/twilio/send", sendToTwilio);
app.get("/send", sendToTwilio);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(
    `The texter app started successfully and is listening for HTTP requests on ${PORT}`
  );
});
