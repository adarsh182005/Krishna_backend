import express from 'express';
const router = express.Router();
import {
  addOrderItems,
  getOrderById,
  getMyOrders,
  getOrders,
} from '../controllers/orderController.js';
import { protect } from '../middleware/authMiddleware.js';
import { admin } from '../middleware/adminMiddleware.js';
import Order from '../models/orderModel.js';

router.route('/').post(protect, addOrderItems).get(protect, admin, getOrders);
router.route('/myorders').get(protect, getMyOrders);
router.route('/:id').get(protect, getOrderById);

// Add a route to get order statistics for the admin dashboard
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $match: { isPaid: true } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);
    const pendingOrders = await Order.countDocuments({ isDelivered: false });
    const deliveredOrders = await Order.countDocuments({ isDelivered: true });

    res.json({
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      pendingOrders,
      deliveredOrders
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;