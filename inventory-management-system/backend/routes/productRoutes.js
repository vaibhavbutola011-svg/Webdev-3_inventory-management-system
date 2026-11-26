const express = require('express');
const controller = require('../controllers/productController');
const { validateCreateProduct, validateUpdateProduct, validateStockChange } = require('../middleware/validateProduct');

const router = express.Router();

// Static routes MUST be declared before "/:id" so they are not treated as IDs
router.get('/low-stock', controller.getLowStock);
router.get('/summary', controller.getSummary);

router.route('/').get(controller.getProducts).post(validateCreateProduct, controller.createProduct);

router
  .route('/:id')
  .get(controller.getProductById)
  .put(validateUpdateProduct, controller.updateProduct)
  .delete(controller.deleteProduct);

router.patch('/:id/stock', validateStockChange, controller.adjustStock);

module.exports = router;
