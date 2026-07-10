/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.stack || err.message);

  const isProd = process.env.NODE_ENV === 'production';

  // PostgreSQL unique violation
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Duplicate entry — this resource already exists'
    });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Invalid reference — the related resource does not exist'
    });
  }

  // Validation errors from express-validator
  if (err.type === 'validation') {
    return res.status(422).json({ error: 'Validation failed', errors: err.errors });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = isProd
    ? (statusCode >= 500 ? 'Internal server error' : (err.message || 'Request failed'))
    : (err.message || 'Internal server error');

  res.status(statusCode).json({
    error: message,
    ...(isProd ? {} : { stack: err.stack })
  });
};

module.exports = errorHandler;
