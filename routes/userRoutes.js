import express from 'express';
const router = express.Router();
import { registerUser, authUser, getUserProfile, updateUserProfile } from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js'; // Import protect middleware

router.post('/register', registerUser);
router.post('/login', authUser);
// Protected routes for profile management
router.route('/profile').get(protect, getUserProfile).put(protect, updateUserProfile);

export default router;
