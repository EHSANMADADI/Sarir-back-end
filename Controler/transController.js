import axios from 'axios';
import https from 'https';
import dotenv from "dotenv";

dotenv.config();

export async function transController(req, res) {
  const startTime = Date.now();
  let userId = null;

  try {
    const { accessToken, selectedLanguage, text } = req.body;
    const TRANSLATE_URL = process.env.TRANSLATE_URL;

    if (!accessToken) {
      return res.status(400).json({ error: 'accessToken is required' });
    }
    if (!selectedLanguage || !text) {
      return res.status(400).json({ error: 'selectedLanguage and text are required' });
    }

    // --- اعتبارسنجی کاربر ---
    const response = await axios.get(
      'http://localhost:3300/api/UserQuery/GetCurrentUser',
      {
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

    console.log('translate-start');

    // --- تنظیم هدر برای SSE (استریم به کلاینت) ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // --- ارسال درخواست به سرور ترجمه به‌صورت استریم ---
    const generateResponse = await fetch(`${TRANSLATE_URL}/api/translate`, {
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

    const reader = generateResponse.body.getReader();
    const decoder = new TextDecoder("utf-8");

    // --- خواندن داده‌های استریم از سرور ترجمه ---
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // هر data را مستقیماً برای کلاینت می‌فرستیم
      res.write(chunk);
    }

    // --- پایان استریم ---
    res.write(`\n\ndata: ${JSON.stringify({
      type: "end",
      message: "Stream completed",
      duration: `${Date.now() - startTime}ms`,
      userId
    })}\n\n`);

    res.end();

  } catch (err) {
    console.error("transController error:", err.message);
    // ارسال خطا به صورت استریم به کلاینت
    res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
    res.end();
  }
}
