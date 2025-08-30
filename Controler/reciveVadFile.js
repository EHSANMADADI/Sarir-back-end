import UserFileModel from '../Models/userFileModel.js';
import archiver from 'archiver';
import { minioClient } from '../Min-Io-FileManagnent/Min-io-api/utils/MinioClient.js';
import axios from 'axios';
import https from 'https'
export async function reciveVadFile(req, res) {
    try {
        const { accessToken } = req.params;
        var userId
    
        const response = await axios.get('https://185.83.112.4:3300/api/UserQuery/GetCurrentUser', {
          headers: {
            'accept': 'application/json',
            'Authorization': accessToken
          }
        });
        userId = response.data.returnValue.id;

        if (!userId) {
          return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        const files = await UserFileModel.find({
            userId: userId,
            type: "vad"
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

        await archive.finalize(); // send Arshive file

    } catch (err) {
      if (err.status == 401) {
        return res.status(401).json({ error: 'User not found or invalid access token' });
  
      }
        console.error("Error retrieving files from MinIO:", err);
        res.status(500).json({ error: "Server error" });
    }
}