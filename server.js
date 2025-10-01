import dotenv from 'dotenv';
dotenv.config();   // ✅ must be at the top before other imports

import express from 'express';
import connectDB from './config/db.js';
import productRoutes from './routes/productRoutes.js';
import userRoutes from './routes/userRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/payment.js';
import cors from 'cors';
import path from 'path';

connectDB();

const app = express();

// Regular middleware
app.use(express.json());
app.use(cors());

// Get the directory name for the current module's path
const __dirname = path.resolve();

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

app.get('/', (req, res) => {
  res.send('API is running...');
});

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);  // payment.js handles webhook

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
