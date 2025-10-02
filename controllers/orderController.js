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

  // --- BEGIN STOCK VALIDATION AND DEDUCTION (Using Transaction for Atomicity) ---
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const item of orderItems) {
      // 1. Get the latest product data within the transaction
      const product = await Product.findByIdAndUpdate(
        item.product,
        {
          // Use $inc to atomically decrement stock, but only if enough stock exists
          $inc: { countInStock: -item.qty }
        },
        {
          new: false,
          session: session
        }
      ).select('countInStock name');

      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Product not found: ${item.name}` });
      }

      // 2. Critical Stock Check (check if old stock was sufficient before proceeding)
      if (product.countInStock < item.qty) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: `Insufficient stock for ${item.name}. Available: ${product.countInStock}` });
      }
    }

    // 3. Create the Order (only runs if all stock checks/deductions were successful)
    const order = new Order({
      orderItems: orderItems.map(item => ({
        ...item,
        quantity: item.qty,
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

    // 4. Commit the transaction (Order saved AND Stock updated)
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
      // 1. Match only orders with at least one item
      { $match: { 'orderItems.0': { $exists: true } } },

      // 2. Deconstruct the orderItems array
      { $unwind: '$orderItems' },

      // 3. Group by product ID and calculate totals
      {
        $group: {
          _id: '$orderItems.product', // Group by product ID
          name: { $first: '$orderItems.name' },
          totalUnitsSold: { $sum: '$orderItems.quantity' },
          totalRevenue: {
            $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] }
          },
        },
      },

      // 4. Sort by total revenue (descending)
      { $sort: { totalRevenue: -1 } },

      // 5. Limit to top 10 (or adjust as needed)
      { $limit: 10 },

      // 6. Project the final structure
      {
        $project: {
          _id: '$_id',
          name: '$name',
          totalUnitsSold: '$totalUnitsSold',
          totalRevenue: '$totalRevenue',
        },
      },
    ]);

    res.json(topSelling);
  } catch (error) {
    console.error('Error fetching top selling products:', error);
    res.status(500).json({ message: 'Failed to fetch top selling products report.' });
  }
};

// @desc    Get sales data grouped by month
// @route   GET /api/orders/sales-by-month
// @access  Private/Admin
const getSalesByMonth = async (req, res) => {
  try {
    const salesByMonth = await Order.aggregate([
      // 1. Match only orders with at least one item
      { $match: { 'orderItems.0': { $exists: true } } },

      // 2. Group by year and month
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          totalRevenue: { $sum: '$totalPrice' },
        },
      },

      // 3. Sort chronologically
      { $sort: { '_id.year': 1, '_id.month': 1 } },

      // 4. Project and format the output
      {
        $project: {
          _id: 0,
          revenue: '$totalRevenue',
          // Use $dateToString to format the month (requires MongoDB 4.0+)
          month: {
            $dateToString: {
              format: '%b %Y',
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: 1, // Must provide day for $dateFromParts
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
    res.status(500).json({ message: 'Failed to fetch monthly sales report.' });
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