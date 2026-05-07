function notFound(req, res, _next) {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
}

function errorHandler(err, _req, res, _next) {
  console.error('[error]', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    details: err.details || undefined,
  });
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

module.exports = { notFound, errorHandler, HttpError };
