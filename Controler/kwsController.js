import axios from 'axios';
import https from 'https';
import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/uploadToMinio.js';
import UserFileModel from '../Models/userFileModel.js';
import FormData from 'form-data';
import mime from 'mime-types';
import dotenv from "dotenv";

dotenv.config();

export async function kwsController(req, res) {
    const startTime = Date.now();

    try {
        const { 
            objectName,        // فایل اصلی
            supportFiles = [], // آرایه‌ای از objectName فایل‌های پشتیبان
            supportName,       // کلمه جستجو
            accessToken,
            lang = 'fa',
            category = 'kwsFile'
        } = req.body;

        const bucketName = "sarirbucket";
        const KWS_URL = process.env.KWS_URL;

        if (!objectName || !accessToken || !supportName) {
            return res.status(400).json({ error: 'objectName, supportName and accessToken are required' });
        }

        // --- اعتبارسنجی کاربر ---
        const response = await axios.get(
            'http://185.83.112.4:3300/api/UserQuery/GetCurrentUser',
            { headers: { accept: 'application/json', Authorization: accessToken } }
        );

        const userId = response.data.returnValue.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        // ---- ساخت FormData برای ارسال به سرویس KWS ----
        const form = new FormData();
        form.append("support_name", supportName);
        form.append("lang", lang);

        // --- فایل اصلی ---
        const mainFileStream = await minioClient.getObject(bucketName, objectName);
        const mainFileDoc = await UserFileModel.findOne({ minioObjectName: objectName });
        const mainOriginalFilename = mainFileDoc?.originalFilename || objectName;

        form.append("files", mainFileStream, {
            filename: mainOriginalFilename,
            contentType: mime.lookup(mainOriginalFilename) || 'application/octet-stream'
        });

        // --- فایل‌های پشتیبان ---
        for (const fileName of supportFiles) {
            const supportFileStream = await minioClient.getObject(bucketName, fileName);
            const supportFileDoc = await UserFileModel.findOne({ minioObjectName: fileName });
            const supportOriginalFilename = supportFileDoc?.originalFilename || fileName;

            form.append("support_files", supportFileStream, {
                filename: supportOriginalFilename,
                contentType: mime.lookup(supportOriginalFilename) || 'application/octet-stream'
            });
        }

        // ---- ارسال به سرویس KWS ----
        const kwsResponse = await axios.post(
            `${KWS_URL}/process`,
            form,
            {
                headers: form.getHeaders(),
                httpsAgent: new https.Agent({ rejectUnauthorized: false })
            }
        );

        // ---- ذخیره در دیتابیس ----
        const newRecord = new UserFileModel({
            userId,
            originalFilename: mainOriginalFilename,
            minioObjectName: objectName,
            type: category,
            kwsResponse: kwsResponse.data,
            supportFiles: supportFiles,
            responseTime: Date.now() - startTime,
            status: true
        });

        await newRecord.save();

        // ---- پاسخ به کلاینت ----
        return res.status(200).json({
            message: "KWS processed successfully",
            response: kwsResponse.data
        });

    } catch (err) {
        console.error("KWS error:", err?.response?.data || err.message);
        return res.status(500).json({
            error: "KWS processing failed",
            details: err?.response?.data || err.message
        });
    }
}
