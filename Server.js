import app from './app.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: './config.env' });

const MongoURL = process.env.DATABASE_LOCAL;
console.log(MongoURL);

mongoose.connect(MongoURL).then(() => {
    const port = process.env.PORT;

    app.listen(port, () => {
        console.log(`✅ Server running with HTTP on port ${port}`);
    });
}).catch(err => console.log(err));
