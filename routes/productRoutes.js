import express from 'express';
const router = express.Router();
import {
  getProducts,
  getProductById,
  importData,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';
import { protect } from '../middleware/authMiddleware.js';
import { admin } from '../middleware/adminMiddleware.js';

router.route('/').get(getProducts).post(protect, admin, createProduct); // Admin route to create a product
router.route('/import').post(protect, admin, importData);
router.route('/:id').get(getProductById).put(protect, admin, updateProduct).delete(protect, admin, deleteProduct); // Admin routes to update/delete

export default router;
