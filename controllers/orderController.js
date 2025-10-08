import Order from '../models/orderModel.js';
import Product from '../models/productModel.js';
import mongoose from 'mongoose';

const addOrderItems = async (req, res) => {
    const { orderItems, shippingAddress, paymentMethod, totalPrice } = req.body;

    if (!orderItems || orderItems.length === 0) {
        res.status(400).json({ message: 'No order items' });
        return;
    }

    // --- RE-ENABLING TRANSACTION FOR STOCK MANAGEMENT ---
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Decrease stock for each item in the order
        for (const item of orderItems) {
            const product = await Product.findById(item.product).session(session);

            if (!product) {
                await session.abortTransaction();
                return res.status(404).json({ message: `Product not found: ${item.name}` });
            }

            if (product.countInStock < item.qty) {
                await session.abortTransaction();
                return res.status(400).json({
                    message: `Insufficient stock for ${item.name}. Only ${product.countInStock} left.`,
                });
            }

            product.countInStock -= item.qty;
            await product.save({ session });
        }

        const order = new Order({
            orderItems: orderItems.map(item => ({
                ...item,
                quantity: item.qty,
                product: item._id
            })),
            user: req.user._id,
            shippingAddress,
            paymentMethod,
            totalPrice,
            isPaid: true, // Marking as paid for testing
            paidAt: Date.now(),
            paymentStatus: 'completed',
        });

        const createdOrder = await order.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json(createdOrder);

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Order creation and stock update failed:", error);
        res.status(500).json({ message: 'Failed to place order due to a server error.' });
    }
};

const getOrderById = async (req, res) => {
  const order = await Order.findById(req.params.id).populate(
    'user',
    'name email'
  );

  if (order && (order.user._id.toString() === req.user._id.toString() || req.user.isAdmin)) {
    res.json(order);
  } else {
    res.status(404).json({ message: 'Order not found' });
  }
};

const updateOrderToPaid = async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (order) {
        order.isPaid = true;
        order.paidAt = Date.now();
        order.paymentResult = {
            id: 'test_payment_id_' + Date.now(),
            status: 'completed',
            update_time: new Date().toISOString(),
            email_address: 'test@example.com',
        };

        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } else {
        res.status(404).json({ message: 'Order not found' });
    }
};

const getMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id });
  res.json(orders);
};

const getOrders = async (req, res) => {
  const orders = await Order.find({}).populate('user', 'id name email');
  res.json(orders);
};

const getTopSellingProducts = async (req, res) => {
  try {
    const topSelling = await Order.aggregate([
      { $unwind: '$orderItems' },
      {
        $group: {
          _id: '$orderItems.product',
          name: { $first: '$orderItems.name' },
          totalUnitsSold: { $sum: '$orderItems.quantity' },
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
  updateOrderToPaid,
  getMyOrders,
  getOrders,
  getTopSellingProducts,
  getSalesByMonth,
};