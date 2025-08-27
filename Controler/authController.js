import bcrypt from 'bcrypt';
import UserModel from '../Models/userModel.js';
import axios from 'axios';
import https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { minioClient, uploadToMinio } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import fs from 'fs';

const saltRounds = 10;





async function login(req, res) {
    try {
        const { username, password, fingerprint } = req.body;

        if (!username || !password || !fingerprint) {
            return res.status(400).json({ message: 'Username, password, and fingerprint are required' });
        }

        // بررسی کاربر در دیتابیس
        const user = await UserModel.findOne({ username });
        console.log("Fetched user from DB:", user);

        if (!user) {
            return res.status(404).json({ message: 'User not found in database' });
        }

        // ارسال درخواست به API خارجی
        const response = await axios.get(`https://185.83.112.4:3300/api/TokenQuery/Auth`, {
            params: {
                Username: username,
                Password: password,
                FingerPrint: fingerprint
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
        console.log(response);


        // ترکیب پاسخ API خارجی با id کاربر دیتابیس خودمان
        const responseData = {
            ...response.data,
            userId: user._id,  // یا user.id بسته به مدل شما
            avatar: user.avatar
        };
        console.log("response.data:", response.data);


        res.status(response.status).json(responseData);

    } catch (err) {
        console.error(err);

        if (err.response) {
            res.status(err.response.status).json(err.response.data);
        } else {
            res.status(500).json({ message: 'Server error' });
        }
    }
}


async function UpdateUser(req, res) {
    try {
        const { userId } = req.params;
        const { password } = req.body;
        const category = "userAvatar";
        const MINIO_BUCKET_NAME='sarirbucket'

        const updateData = {};

        // اگر رمز جدید ارسال شده بود
        if (password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        // اگر فایل آواتار ارسال شده بود
        if (req.file) {
            // ساخت دیتا برای تابع uploadToMinio
            const fileData = {
                filename: req.file.originalname,
                buffer: fs.readFileSync(req.file.path),
                mimetype: req.file.mimetype,
                userId: userId
            };

            // آپلود به MinIO با تابع جدید
            const uploadedFile = await uploadToMinio(fileData, category);

            // حذف فایل موقت از پوشه uploads
            fs.unlinkSync(req.file.path);

            // ساخت لینک عمومی
            const avatarUrl = `${process.env.MINIO_PUBLIC_URL}/${MINIO_BUCKET_NAME}/${uploadedFile.objectName}`;
            updateData.avatar = avatarUrl;
        }

        // آپدیت کاربر
        const updatedUser = await UserModel.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "کاربر پیدا نشد" });
        }

        res.json({
            message: "پروفایل با موفقیت به‌روزرسانی شد",
            user: updatedUser
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "خطای سرور" });
    }
}




async function register(req, res) {
    try {
        const { username, password, fingerprint } = req.body;

        if (!username || !password || !fingerprint) {
            return res.status(400).json({ message: 'username, password, and fingerprint are required' });
        }

        const existingUser = await UserModel.findOne({ username });

        if (existingUser) {
            return res.status(409).json({ message: 'username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = await UserModel.create({ username, password: hashedPassword, fingerprint });

        res.status(201).json({ message: 'user registered successfully', user: { username } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
}



export default { login, register, UpdateUser };
