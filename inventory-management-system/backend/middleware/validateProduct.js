// Request-body validation for product endpoints.
// Mongoose validation still runs afterwards as a second safety net.

const REQUIRED_FIELDS = ['name', 'sku', 'category', 'price', 'quantity', 'reorderLevel', 'supplier'];
const STRING_FIELDS = ['name', 'sku', 'category', 'supplier'];
const NUMBER_FIELDS = ['price', 'quantity', 'reorderLevel'];
const INTEGER_FIELDS = ['quantity', 'reorderLevel'];

const LABELS = {
  name: 'Product name',
  sku: 'SKU',
  category: 'Category',
  price: 'Price',
  quantity: 'Quantity',
  reorderLevel: 'Reorder level',
  supplier: 'Supplier',
};

const checkFields = (body, { requireAll }) => {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['Request body must be a JSON object'];
  }

  const fields = requireAll ? REQUIRED_FIELDS : Object.keys(body).filter((k) => REQUIRED_FIELDS.includes(k));

  if (!requireAll && fields.length === 0) {
    return ['Provide at least one field to update'];
  }

  for (const field of fields) {
    const value = body[field];
    const label = LABELS[field];

    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      errors.push(`${label} is required`);
      continue;
    }

    if (STRING_FIELDS.includes(field) && typeof value !== 'string') {
      errors.push(`${label} must be text`);
      continue;
    }

    if (NUMBER_FIELDS.includes(field)) {
      if (typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '')) {
        errors.push(`${label} must be a number`);
        continue;
      }
      const num = Number(value);
      if (!Number.isFinite(num)) {
        errors.push(`${label} must be a valid number`);
        continue;
      }
      if (num < 0) {
        errors.push(`${label} cannot be negative`);
        continue;
      }
      if (INTEGER_FIELDS.includes(field) && !Number.isInteger(num)) {
        errors.push(`${label} must be a whole number`);
      }
    }
  }

  return errors;
};

const buildMiddleware = (requireAll) => (req, res, next) => {
  const errors = checkFields(req.body, { requireAll });
  if (errors.length) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }
  next();
};

exports.validateCreateProduct = buildMiddleware(true);
exports.validateUpdateProduct = buildMiddleware(false);

exports.validateStockChange = (req, res, next) => {
  const change = req.body ? req.body.change : undefined;

  if (change === undefined || change === null || change === '' || typeof change === 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['"change" is required and must be a number (positive to add stock, negative to remove)'],
    });
  }

  const num = Number(change);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['"change" must be a whole number'],
    });
  }
  if (num === 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['"change" cannot be zero'],
    });
  }

  req.body.change = num;
  next();
};
