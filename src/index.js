require("dotenv").config();

const express = require("express");
const { send } = require("./controllers/twilio");

const app = express();

// Log request
app.use((req, res, next) => {
  console.log(`${req.method} request for '${req.url}'`);
  next();
});

// Update loggers for platform-specifity if applicable
app.use((req, res, next) => {
  const {headers} = req;

  // If the request is being handled by a Google Cloud Run service
  // Update the appropriate console functions
  if (headers['x-cloud-trace-context']) {
    console._info = console.info;
    console.info = (message) => console._info(JSON.stringify({severity: 'INFO', message}));

    console._warn = console.warn;
    console.warn = (message) => console._warn(JSON.stringify({severity: 'WARNING', message}));

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

app.get("/send", send);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(
    `The texter app started successfully and is listening for HTTP requests on ${PORT}`
  );
});
