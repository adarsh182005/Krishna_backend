import Order from '../models/orderModel.js';
import Product from '../models/productModel.js';
import mongoose from 'mongoose';

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
const addOrderItems = async (req, res) => {
  const {
    orderItems,
    shippingAddress,
    paymentMethod,
    totalPrice,
  } = req.body;

  if (!orderItems || orderItems.length === 0) {
    res.status(400).json({ message: 'No order items' });
    return;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const item of orderItems) {
      const product = await Product.findByIdAndUpdate(
        item.product,
        { $inc: { countInStock: -item.quantity } }, // ✅ use quantity
        { new: false, session }
      ).select('countInStock name');

      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Product not found: ${item.name}` });
      }

      if (product.countInStock < item.quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: `Insufficient stock for ${item.name}. Available: ${product.countInStock}`,
        });
      }
    }

    const order = new Order({
      orderItems: orderItems.map(item => ({
        ...item,
        quantity: item.quantity, // ✅ ensure consistency
      })),
      user: req.user._id,
      shippingAddress,
      paymentMethod,
      totalPrice,
      isPaid: false,
      paidAt: null,
      paymentStatus: 'pending',
    });

    const createdOrder = await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(createdOrder);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Order creation and stock update failed:", error);
    res.status(500).json({ message: 'Failed to place order due to a server error or stock issue.' });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  const order = await Order.findById(req.params.id).populate(
    'user',
    'name email'
  );

  if (order && (order.user.toString() === req.user._id.toString() || req.user.isAdmin)) {
    res.json(order);
  } else {
    res.status(404).json({ message: 'Order not found' });
  }
};

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id });
  res.json(orders);
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = async (req, res) => {
  const orders = await Order.find({}).populate('user', 'id name email');
  res.json(orders);
};

// @desc    Get top selling products for report
// @route   GET /api/orders/top-selling
// @access  Private/Admin
const getTopSellingProducts = async (req, res) => {
  try {
    const topSelling = await Order.aggregate([
      { $unwind: '$orderItems' },
      {
        $group: {
          _id: '$orderItems.product',
          name: { $first: '$orderItems.name' },
          totalUnitsSold: { $sum: '$orderItems.quantity' }, // ✅ fixed field name
          totalRevenue: {
            $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] }
          },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: 1,
          totalUnitsSold: 1,
          totalRevenue: 1,
        },
      },
    ]);

    res.json(topSelling);
  } catch (error) {
    console.error('Error fetching top selling products:', error);
    res.status(500).json({ message: `Aggregation pipeline failed: ${error.message}` });
  }
};

// @desc    Get sales data grouped by month
// @route   GET /api/orders/sales-by-month
// @access  Private/Admin
const getSalesByMonth = async (req, res) => {
  try {
    const salesByMonth = await Order.aggregate([
      {
        $match: {
          orderItems: { $exists: true, $type: 'array', $ne: [] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          totalRevenue: { $sum: '$totalPrice' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      {
        $project: {
          _id: 0,
          revenue: '$totalRevenue',
          month: {
            $dateToString: {
              format: '%b %Y',
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: 1,
                },
              },
            },
          },
        },
      },
    ]);

    res.json(salesByMonth);
  } catch (error) {
    console.error('Error fetching sales by month report:', error);
    res.status(500).json({ message: `Aggregation pipeline failed: ${error.message}` });
  }
};

export {
  addOrderItems,
  getOrderById,
  getMyOrders,
  getOrders,
  getTopSellingProducts,
  getSalesByMonth,
};
