// 404 handler for unknown API routes
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

// Centralized error handler
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message || 'Server error';
  let errors;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errors = Object.values(err.errors).map((e) => e.message);
    message = 'Validation failed';
  }

  // Invalid ObjectId
  else if (err.name === 'CastError') {
    statusCode = 400;
    message = err.path === '_id' ? `Invalid product ID: ${err.value}` : `Invalid value for ${err.path}`;
  }

  // Duplicate key (unique SKU)
  else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || err.keyValue || { sku: 1 })[0] || 'sku';
    const value = err.keyValue ? err.keyValue[field] : '';
    message = `Duplicate ${field.toUpperCase()}: a product with ${field.toUpperCase()} "${value}" already exists`;
  }

  // Malformed JSON body
  else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  }

  if (statusCode >= 500) console.error(err);

  const body = { success: false, message };
  if (errors) body.errors = errors;
  if (process.env.NODE_ENV !== 'production' && statusCode >= 500) body.stack = err.stack;

  res.status(statusCode).json(body);
};

module.exports = { notFound, errorHandler };
