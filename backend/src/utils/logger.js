/**
 * Structured Logging with Pino
 * Request IDs, structured output, production-ready
 */

const pino = require('pino');
const { v4: uuidv4 } = require('uuid');

// Create logger instance
const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  } : undefined,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({
      service: 'emerkato-api',
      version: process.env.npm_package_version || '1.0.0'
    })
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV || 'development'
  }
});

/**
 * Create a child logger with request context
 * @param {object} req - Express request object
 * @returns {pino.Logger}
 */
function createRequestLogger(req) {
  const requestId = req.headers['x-request-id'] || uuidv4();
  return logger.child({
    requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.tg_user_id || null
  });
}

/**
 * Express middleware to attach request logger
 */
function requestLogger(req, res, next) {
  req.log = createRequestLogger(req);
  req.requestId = req.log.bindings().requestId;

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);

  const start = Date.now();

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = req.log.child({ statusCode: res.statusCode, duration });

    if (res.statusCode >= 500) {
      log.error({ err: res.locals.error }, 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      log.warn('Request completed with client error');
    } else {
      log.info('Request completed');
    }
  });

  req.log.info('Request started');
  next();
}

/**
 * Error logging helper
 * @param {Error} err
 * @param {object} context - Additional context
 */
function logError(err, context = {}) {
  logger.error({ err, ...context }, err.message);
}

/**
 * Audit logging for sensitive operations
 * @param {string} action - Action performed
 * @param {object} details - Details about the action
 */
function auditLog(action, details) {
  logger.info({ audit: true, action, ...details }, `Audit: ${action}`);
}

module.exports = {
  logger,
  createRequestLogger,
  requestLogger,
  logError,
  auditLog
};