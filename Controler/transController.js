import axios from 'axios';
import https from 'https';
import dotenv from "dotenv";

export async function transController(req, res) {
    const startTime = Date.now();
    let userId = null;
    dotenv.config();

    try {
        const { accessToken, selectedLanguage, text } = req.body;
        const TRANSLATE_URL=process.env.TRANSLATE_URL
        if (!accessToken) {
            return res.status(400).json({ error: 'accessToken is required' });
        }
        if (!selectedLanguage || !text) {
            return res.status(400).json({ error: 'selectedLanguage and text are required' });
        }

        // --- اعتبارسنجی کاربر ---
        const agent = new https.Agent({ rejectUnauthorized: false });
        const response = await axios.get(
            'https://185.83.112.4:3300/api/UserQuery/GetCurrentUser',
            {
                httpsAgent: agent,
                headers: {
                    accept: 'application/json',
                    Authorization: accessToken,
                },
            }
        );

        userId = response.data.returnValue?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not found or invalid access token' });
        }

        // --- ارسال درخواست به سرور generate ---
        const generateResponse = await fetch(`${TRANSLATE_URL}/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                language: selectedLanguage,
                text,
            }),
        });

        if (!generateResponse.ok) {
            throw new Error(`Generate API failed: ${generateResponse.status}`);
        }

        const result = await generateResponse.json();

        return res.status(200).json({
            success: true,
            userId,
            data: result,
            duration: `${Date.now() - startTime}ms`
        });

    } catch (err) {
        console.error("transController error:", err.message);
        return res.status(500).json({ error: "Internal server error", details: err.message });
    }
}
