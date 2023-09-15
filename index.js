require('dotenv').config();

const express = require('express');
const { sendText } = require('./texter');

const app = express();

// Log request
app.use((req, res, next) => {
  console.log(`${req.method} request for '${req.url}'`);
  next();
});

// Authenticate request
const { API_KEY } = process.env;
app.use((req, res, next) => {
  const { headers } = req;

  if (headers["x-api-key"] !== API_KEY) {
    console.log(`Invalid API key: ${headers["x-api-key"]}`);
    res.status(401).send({ error: "Invalid API key" });
  } else {
    next();
  }
});

app.get('/ping', async (req, res) => {
  res.send('pong');
});

app.get('/send', async (req, res) => {
  const { body, to } = req.query;

  sendText(body, to);

  res.send({ success: "I THINK SO", query: req.query });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(
    `The texter app started successfully and is listening for HTTP requests on ${PORT}`
  );
});