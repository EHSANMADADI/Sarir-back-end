import UserFileModel from '../Models/userFileModel.js';
import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/MinioClient.js';
import axios from 'axios';
import https from 'https';

export async function reciveSuperFile(req, res) {
    try {
        const accessToken = req.body.accessToken;
        const objectName = req.body.objectName;

        if (!accessToken || !objectName) {
            return res.status(400).json({ error: "accessToken و objectName الزامی هستند" });
        }

        // --- اعتبارسنجی کاربر
        const response = await axios.get(
            "http://185.83.112.4:3300/api/UserQuery/GetCurrentUser",
            {
                headers: {
                    accept: "application/json",
                    Authorization: accessToken,
                },
            }
        );

        const userId = response.data.returnValue.id;
        if (!userId) {
            return res.status(401).json({ error: "User not found or invalid access token" });
        }

        // --- بررسی فایل در دیتابیس
        const file = await UserFileModel.findOne({
            userId,
            "responseSuper.output_images": { $in: [objectName] },
        });

        if (!file) {
            return res.status(404).json({ error: "File not found for this user." });
        }

        const bucketName = "sarirbucket";

        // --- ساخت Presigned URL (اعتبار 24 ساعت)
        const presignedUrl = await minioClient.presignedGetObject(
            bucketName,
            objectName,
            24 * 60 * 60
        );

        // --- خواندن فایل از MinIO
        const stream = await minioClient.getObject(bucketName, objectName);
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        // --- تبدیل فایل به base64
        const base64File = buffer.toString("base64");

        return res.status(200).json({
            message: "File retrieved successfully",
            objectName,              // ➝ اضافه شد
            fileUrl: presignedUrl,
            fileBase64: base64File,
        });

    } catch (err) {
        if (err.status === 401) {
            return res.status(401).json({ error: "User not found or invalid access token" });
        }
        console.error("Error retrieving file:", err);
        res.status(500).json({ error: "Server error", details: err.message });
    }
}
