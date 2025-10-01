import express from 'express';
import Stripe from 'stripe';
import Order from '../models/orderModel.js';
import { protect } from '../middleware/authMiddleware.js';
import dotenv from 'dotenv';

// Load environment variables in this file too
dotenv.config();

const router = express.Router();

// Debug: Check if the key is loaded
console.log('Stripe Key in payment.js:', process.env.STRIPE_SECRET_KEY ? 'Loaded' : 'NOT LOADED');

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20', // keep SDK stable
});

// ... rest of your code

// Create payment intent
router.post('/create-payment-intent', protect, async (req, res) => {
  try {
    const { amount, orderId, items } = req.body;

    const calculatedAmount = items.reduce((total, item) => {
      return total + item.price * item.quantity;
    }, 0);

    if (Math.abs(amount - calculatedAmount) > 0.01) {
      return res.status(400).json({ error: 'Amount mismatch' });
    }

    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe expects amount in paise
      currency: 'inr',
      metadata: {
        orderId,
        userId: req.user.id,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Payment intent creation failed:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Confirm payment and update order
router.post('/confirm-payment', protect, async (req, res) => {
  try {
    const { paymentIntentId, orderId } = req.body;
    const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      const order = await Order.findByIdAndUpdate(
        orderId,
        {
          paymentStatus: 'completed',
          paymentIntentId,
          status: 'confirmed',
          paidAt: new Date(),
        },
        { new: true }
      );

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json({
        success: true,
        message: 'Payment confirmed successfully',
        order,
      });
    } else {
      res.status(400).json({
        error: 'Payment not completed',
        status: paymentIntent.status,
      });
    }
  } catch (error) {
    console.error('Payment confirmation failed:', error);
    res.status(500).json({ error: 'Payment confirmation failed' });
  }
});

// Webhook to handle Stripe events
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripeClient.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      console.log('PaymentIntent succeeded:', paymentIntent.id);

      try {
        await Order.findOneAndUpdate(
          { _id: paymentIntent.metadata.orderId },
          {
            paymentStatus: 'completed',
            status: 'confirmed',
            paidAt: new Date(),
            paymentIntentId: paymentIntent.id,
          }
        );
      } catch (error) {
        console.error('Failed to update order after payment success:', error);
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      console.log('PaymentIntent failed:', paymentIntent.id);

      try {
        await Order.findOneAndUpdate(
          { _id: paymentIntent.metadata.orderId },
          {
            paymentStatus: 'failed',
            status: 'payment_failed',
          }
        );
      } catch (error) {
        console.error('Failed to update order after payment failure:', error);
      }
    } else {
      console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }
);

// ✅ This line was missing
export default router;
