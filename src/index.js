require("dotenv").config();

const express = require("express");
const { sendText } = require("./lib/twilio");

const app = express();

// Log request
app.use((req, res, next) => {
  console.log(`${req.method} request for '${req.url}'`);
  next();
});

// Update error logger for platform-specifity if applicable
app.use((req, res, next) => {
  const {headers} = req;

  // If the request is being handled by a Google Cloud Run service, update the console.error function
  if (headers['x-cloud-trace-context']) {
    console._error = console.error;
    console.error = (message) => console._error(JSON.stringify({severity: 'ERROR', message}));
  }

  next();
});

// Authenticate request
const { API_KEY } = process.env;
app.use((req, res, next) => {
  const { headers } = req;

  if (headers["x-api-key"] !== API_KEY) {
    console.warn(`Invalid API key: ${headers["x-api-key"]}`);
    res.status(401).send({ error: "Invalid API key" });
  } else {
    next();
  }
});

app.get("/ping", async (req, res) => {
  res.send("pong");
});

app.get("/send", async (req, res) => {
  const { body, to } = req.query;
  const response = { success: false, query: req.query };

  try {
    const info = await sendText(body, to);
    console.log(`Text sent: ${JSON.stringify(info.toJSON())}`);
    response.success = true;
  } catch (error) {
    console.error(`Error occurred: ${error.message}`);
    response.error = error;
    res.status(error.status || 500);
  }

  res.send(response);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(
    `The texter app started successfully and is listening for HTTP requests on ${PORT}`
  );
});
