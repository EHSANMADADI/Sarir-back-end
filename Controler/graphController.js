import axios from 'axios';
import https from 'https';
import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import UserFileModel from '../Models/userFileModel.js';
import FormData from 'form-data';
import mime from 'mime-types';
import dotenv from "dotenv";

dotenv.config();

export async function graphController(req, res) {
    const startTime = Date.now();
    try {
        const { objectName, accessToken } = req.body;
        const bucketName = "sarirbucket";
        const graph_url = process.env.graph_url;

        if (!objectName || !accessToken) {
            return res.status(400).json({ error: 'objectName and accessToken are required' });
        }

        // --- اعتبارسنجی کاربر ---
        const userResponse = await axios.get(
            'http://185.83.112.4:3300/api/UserQuery/GetCurrentUser',
            { headers: { accept: 'application/json', Authorization: accessToken } }
        );

        const userId = userResponse.data.returnValue?.id;
        if (!userId) return res.status(401).json({ error: 'User not found or invalid access token' });

        // --- بررسی رکورد ناموفق قبلی ---
        const failedRecord = await UserFileModel.findOne({ userId, originalFilename: objectName, status: false });

        // --- محدودیت حجم ---
        const MAX_SIZE = 2 * 1024 * 1024 * 1024;
        const totalSize = await UserFileModel.aggregate([
            { $match: { userId, type: 'vad' } },
            { $group: { _id: null, total: { $sum: "$size" } } }
        ]);
        const usedSize = totalSize.length > 0 ? totalSize[0].total : 0;
        if (usedSize >= MAX_SIZE) {
            return res.status(402).json({ error: `شما به سقف حجم مجاز (${(MAX_SIZE / (1024 ** 3)).toFixed(2)} GB) رسیده‌اید` });
        }

        // --- گرفتن فایل ورودی از MinIO (به صورت استریم) ---
        const fileStream = await minioClient.getObject(bucketName, objectName);
        const formData = new FormData();
        formData.append('file', fileStream, objectName);

        // --- ارسال فایل به سرویس Graph ---
        const graphResponse = await axios.post(
            `${graph_url}/generate`,
            formData,
            {
                headers: formData.getHeaders(),
                maxBodyLength: Infinity,
            }
        );

        // --- ذخیره نتیجه در MongoDB ---
        const responseData = graphResponse.data;
        const responseTime = Date.now() - startTime;

        await UserFileModel.findOneAndUpdate(
            { userId, originalFilename: objectName },
            { 
                responsegroph: responseData,
                status: true,
                responseTime
            },
            { upsert: true, new: true }
        );

        return res.status(200).json({ message: 'Graph processing completed', data: responseData });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Graph processing failed', details: error.message });
    }
}
