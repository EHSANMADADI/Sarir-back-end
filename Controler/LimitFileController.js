import axios from "axios";
import https from 'https';
import UserFileModel from '../Models/userFileModel.js'; 

export async function LimitFileController(req, res) {
    const { type, accessToken } = req.body;

    if (!type || !accessToken) {
        return res.status(400).json({ error: 'type و accessToken الزامی هستند.' });
    }

    try {
      

        // گرفتن userId از API
        const response = await axios.get('http://185.83.112.4:3300/api/UserQuery/GetCurrentUser', {
           
            headers: {
                'accept': 'application/json',
                'Authorization': accessToken
            }
        });

        const userId = response.data.returnValue.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        ///max Limit=2GB
        const MAX_SIZE = 2 * 1024 * 1024 * 1024;

        // محاسبه حجم مصرف شده
        const totalSizeAgg = await UserFileModel.aggregate([
            { $match: { userId: userId, type: type } },
            { $group: { _id: null, total: { $sum: "$size" } } }
        ]);

        const usedSizeBytes = totalSizeAgg.length > 0 ? totalSizeAgg[0].total : 0;
        const usedSizeGB = usedSizeBytes / (1024 ** 3);
        const maxSizeGB = MAX_SIZE / (1024 ** 3);

        const usagePercentNum = ((usedSizeBytes / MAX_SIZE) * 100).toFixed(1); 
        const usagePercentStr = `${usagePercentNum}%`;

        // محاسبه تعداد درخواست‌های درست و غلط
        const successCount = await UserFileModel.countDocuments({ userId, type, status: true });
        const failCount = await UserFileModel.countDocuments({ userId, type, status: false });
        const totalCount = successCount + failCount;
        const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : 0;

        return res.status(200).json({
            usage: `${usedSizeGB.toFixed(1)}/${maxSizeGB}`, 
            usedGB: parseFloat(usedSizeGB.toFixed(1)),
            maxGB: parseFloat(maxSizeGB),
            usagePercent: parseFloat(usagePercentNum), 
            usagePercentStr, 
            successCount,   // تعداد موفق
            failCount,      // تعداد ناموفق
            totalCount,     // کل درخواست‌ها
            successRate: parseFloat(successRate), // درصد موفقیت
            successRateStr: `${successRate}%`
        });

    } catch (err) {
        if (err.status == 401) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}
