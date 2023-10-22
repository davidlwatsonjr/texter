const { API_KEY } = process.env;

const authAPIRequest = (req, res, next) => {
  const { headers } = req;

  if (headers["x-api-key"] !== API_KEY) {
    console.warn(`Invalid API key: ${headers["x-api-key"]}`);
    res.status(401).send({ error: "Invalid API key" });
  } else {
    next();
  }
};

module.exports = { authAPIRequest };
