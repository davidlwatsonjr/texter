const serverErrorHandler = (err, req, res, next) => {
  const { message } = err;
  console.error(`ERROR - ${message}`);
  res.status(500).send(message);
};

module.exports = { serverErrorHandler };
