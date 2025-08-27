import express from 'express';
import multer from 'multer';


const router = express.Router();
import authController from '../Controler/authController.js';

// POST /api/ath/login
router.post('/login', authController.login);

// POST /api/ath/register
router.post('/register', authController.register);
const upload = multer({ dest: 'uploads/' });

router.put('/update-profile/:userId', upload.single('avatar'),authController.UpdateUser);


export default router; 
