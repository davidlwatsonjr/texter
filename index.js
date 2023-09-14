const express = require('express');
const { sendText } = require('./twilio');

const app = express();

app.use((req, res, next) => {
  console.log(`${req.method} request for '${req.url}'`);
  next();
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