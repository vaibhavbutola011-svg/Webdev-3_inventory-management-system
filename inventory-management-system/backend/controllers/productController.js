const mongoose = require('mongoose');
const Product = require('../models/Product');

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const assertValidId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw httpError(400, `Invalid product ID: ${id}`);
  }
};

// Only these fields may be written by clients
const pickProductFields = (body) => {
  const allowed = ['name', 'sku', 'category', 'price', 'quantity', 'reorderLevel', 'supplier'];
  const data = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
};

// A. POST /api/products
exports.createProduct = async (req, res, next) => {
  try {
    const product = await Product.create(pickProductFields(req.body));
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
};

// B. GET /api/products
exports.getProducts = async (req, res, next) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      order = 'asc',
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};

    if (category && category.trim()) {
      filter.category = new RegExp(`^${escapeRegex(category.trim())}$`, 'i');
    }

    if (minPrice !== undefined && minPrice !== '' || maxPrice !== undefined && maxPrice !== '') {
      filter.price = {};
      if (minPrice !== undefined && minPrice !== '') {
        const min = Number(minPrice);
        if (!Number.isFinite(min)) throw httpError(400, 'minPrice must be a number');
        filter.price.$gte = min;
      }
      if (maxPrice !== undefined && maxPrice !== '') {
        const max = Number(maxPrice);
        if (!Number.isFinite(max)) throw httpError(400, 'maxPrice must be a number');
        filter.price.$lte = max;
      }
      if (filter.price.$gte !== undefined && filter.price.$lte !== undefined && filter.price.$gte > filter.price.$lte) {
        throw httpError(400, 'minPrice cannot be greater than maxPrice');
      }
    }

    if (search && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ name: rx }, { sku: rx }];
    }

    const sortable = ['price', 'name', 'quantity', 'createdAt'];
    if (!sortable.includes(sortBy)) {
      throw httpError(400, `sortBy must be one of: ${sortable.join(', ')}`);
    }
    if (!['asc', 'desc'].includes(String(order).toLowerCase())) {
      throw httpError(400, 'order must be "asc" or "desc"');
    }
    const sortDir = String(order).toLowerCase() === 'desc' ? -1 : 1;
    const sort = { [sortBy]: sortDir, _id: 1 };

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

    const queryBuilder = Product.find(filter).sort(sort).skip((pageNum - 1) * limitNum).limit(limitNum);
    // Case-insensitive name sorting
    if (sortBy === 'name') queryBuilder.collation({ locale: 'en', strength: 2 });

    const countBuilder = Product.countDocuments(filter);

    const [products, total] = await Promise.all([queryBuilder, countBuilder]);

    res.json({
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      count: products.length,
      products,
    });
  } catch (err) {
    next(err);
  }
};

// F. GET /api/products/low-stock
exports.getLowStock = async (req, res, next) => {
  try {
    const lowStockItems = await Product.find({ $expr: { $lte: ['$quantity', '$reorderLevel'] } }).sort({
      quantity: 1,
      name: 1,
    });
    res.json({ count: lowStockItems.length, lowStockItems });
  } catch (err) {
    next(err);
  }
};

// G. GET /api/products/summary  (aggregation pipeline)
exports.getSummary = async (req, res, next) => {
  try {
    const summary = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          totalItems: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalStockValue: { $sum: { $multiply: ['$price', '$quantity'] } },
          avgPrice: { $avg: '$price' },
        },
      },
      {
        $project: {
          totalItems: 1,
          totalQuantity: 1,
          totalStockValue: { $round: ['$totalStockValue', 2] },
          avgPrice: { $round: ['$avgPrice', 2] },
        },
      },
      { $sort: { totalStockValue: -1 } },
    ]);

    res.json({ categories: summary.length, summary });
  } catch (err) {
    next(err);
  }
};

// C. GET /api/products/:id
exports.getProductById = async (req, res, next) => {
  try {
    assertValidId(req.params.id);
    const product = await Product.findById(req.params.id);
    if (!product) throw httpError(404, 'Product not found');
    res.json(product);
  } catch (err) {
    next(err);
  }
};

// D. PUT /api/products/:id
exports.updateProduct = async (req, res, next) => {
  try {
    assertValidId(req.params.id);
    const product = await Product.findByIdAndUpdate(req.params.id, pickProductFields(req.body), {
      new: true,
      runValidators: true,
    });
    if (!product) throw httpError(404, 'Product not found');
    res.json(product);
  } catch (err) {
    next(err);
  }
};

// E. DELETE /api/products/:id
exports.deleteProduct = async (req, res, next) => {
  try {
    assertValidId(req.params.id);
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) throw httpError(404, 'Product not found');
    res.json({ message: 'Product deleted', id: product.id });
  } catch (err) {
    next(err);
  }
};

// H. PATCH /api/products/:id/stock
// Atomic update: the filter guarantees quantity + change >= 0, so concurrent
// sales can never push stock below zero.
exports.adjustStock = async (req, res, next) => {
  try {
    assertValidId(req.params.id);
    const change = req.body.change;

    const filter = { _id: req.params.id };
    if (change < 0) filter.quantity = { $gte: -change };

    const product = await Product.findOneAndUpdate(filter, { $inc: { quantity: change } }, { new: true });

    if (!product) {
      const existing = await Product.findById(req.params.id);
      if (!existing) throw httpError(404, 'Product not found');
      throw httpError(
        400,
        `Insufficient stock: only ${existing.quantity} unit(s) available, cannot remove ${Math.abs(change)}`
      );
    }

    res.json({ message: 'Stock updated', product });
  } catch (err) {
    next(err);
  }
};
