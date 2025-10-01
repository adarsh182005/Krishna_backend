const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const auth = require('../middleware/auth'); // Assuming you have auth middleware

// Create new order
router.post('/', auth, async (req, res) => {
  try {
    const { items, totalAmount, shippingAddress, notes } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ error: 'Valid total amount is required' });
    }

    // Validate items structure
    const validItems = items.every(item => 
      item.productId && 
      item.name && 
      item.price > 0 && 
      item.quantity > 0 && 
      item.image
    );

    if (!validItems) {
      return res.status(400).json({ error: 'Invalid item data' });
    }

    // Calculate and verify total
    const calculatedTotal = items.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);

    if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
      return res.status(400).json({ error: 'Total amount mismatch' });
    }

    // Create order
    const order = new Order({
      userId: req.user.id,
      items,
      totalAmount,
      shippingAddress,
      notes,
      status: 'pending',
      paymentStatus: 'pending'
    });

    await order.save();

    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get all orders for authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('items.productId', 'name price');

    const total = await Order.countDocuments({ userId: req.user.id });

    res.json({
      orders,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order by ID
router.get('/:orderId', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      userId: req.user.id
    }).populate('items.productId', 'name price description');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Update order status (admin only - you can add admin middleware)
router.patch('/:orderId/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const order = await Order.findOneAndUpdate(
      { 
        _id: req.params.orderId,
        userId: req.user.id // Regular users can only update their own orders
      },
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Cancel order (only if pending)
router.patch('/:orderId/cancel', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      userId: req.user.id
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot cancel order that is not pending' });
    }

    order.status = 'cancelled';
    await order.save();

    res.json(order);
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// Get order statistics for user
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const stats = await Order.aggregate([
      { $match: { userId: req.user.id } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalOrders: 0,
      totalSpent: 0,
      pendingOrders: 0,
      completedOrders: 0
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({ error: 'Failed to fetch order statistics' });
  }
});

module.exports = router;