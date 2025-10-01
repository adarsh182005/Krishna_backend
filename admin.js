// admin.js

import AdminJS from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import AdminJSMongoose from '@adminjs/mongoose';
import mongoose from 'mongoose';
import session from 'express-session'; // Recommended for AdminJS authentication

// --- 1. Register Mongoose Adapter ---
AdminJS.registerAdapter(AdminJSMongoose);

// --- 2. Import Your Models (Using ESM syntax) ---
import User from './models/User.js';
import Product from './models/Product.js';

// --- 3. Setup AdminJS ---
const adminJs = new AdminJS({
  resources: [
    {
      resource: User,
      options: {
        // Optional: Customize how the User model is displayed
        properties: {
          password: {
            isVisible: { list: false, show: false, edit: true, filter: false },
          },
        },
      },
    },
    Product,
  ],
  rootPath: '/admin',
});

// --- 4. Setup Authentication and Router ---
const ADMIN = {
  email: 'admin@example.com',
  password: 'securepassword',
};

const router = AdminJSExpress.buildAuthenticatedRouter(
  adminJs,
  {
    authenticate: async (email, password) => {
      if (ADMIN.email === email && ADMIN.password === password) {
        return ADMIN;
      }
      return null;
    },
    cookiePassword: 'sessionsecret', // Must be a strong, unique string
  },
  // You can pass Express middleware here if needed
  null,
  // Session options
  {
    resave: false,
    saveUninitialized: true,
  }
);

// --- 5. Export for server.js ---
export { adminJs, router };