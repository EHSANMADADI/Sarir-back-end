import UserFileModel from '../Models/userFileModel.js';
import archiver from 'archiver';
import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/MinioClient.js';
import axios from 'axios';
import https from 'https';

export async function reciveFile(req, res) {
   var userId=null
    try {
        const { accessToken } = req.params;
        const ssourl='http://localhost:3300/api/UserQuery/GetCurrentUser'
       
      
        const response = await axios.get(`${ssourl}`, {
          headers: {
            'accept': 'application/json',
            'Authorization': accessToken
          }
        });
        userId = response.data.returnValue.id;
        console.log('userId =========>>>>>>>>>>',userId);
        

        if (!userId) {
          return res.status(401).json({ error: 'User not found or invalid access token' });
        }
    
        const files = await UserFileModel.find({
          userId: userId,
          type: "original"
        });
    
        if (!files || files.length === 0) {
          return res.status(404).json({ error: "No original files found for this user." });
        }
    
        const bucketName = "sarirbucket";
    
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename=original-files.zip');
    
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);
    
        for (const file of files) {
          const stream = await minioClient.getObject(bucketName, file.minioObjectName);
          archive.append(stream, { name: file.originalFilename });
        }
    
        await archive.finalize(); // شروع بسته‌بندی و ارسال فایل‌ها
    
      } catch (err) {
        console.error("Error retrieving files from MinIO:", err);
        if (err.status == 401) {
          return res.status(401).json({ error: 'User not found or invalid access token' });
    
        }
        res.status(500).json({ error: "Server error" });
      }
}