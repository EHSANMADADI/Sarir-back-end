import app from './app.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import https from 'https';
import selfsigned from 'selfsigned';

dotenv.config({ path: './config.env' });

const MongoURL = process.env.DATABASE_LOCAL;
console.log(MongoURL);

// گواهی موقت (برای تست لوکال)
const pems = selfsigned.generate(null, { days: 365 });

mongoose.connect(MongoURL).then(() => {
    const port = process.env.PORT || 443;

    https.createServer(
        { key: pems.private, cert: pems.cert }, // کلید و گواهی
        app
    ).listen(port, () => {
        console.log(`✅ Server running with HTTPS on port ${port}`);
    });
}).catch(err => console.log(err));
