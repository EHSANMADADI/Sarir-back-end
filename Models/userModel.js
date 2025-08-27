import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Field name is required'],
        unique: true,
    },
    password: {
        type: String,
        required: [true, 'Password is required']
    },
    fingerprint: {
        type: String,
        required: [true, 'Fingerprint is required']
    },
    avatar: {
        type: String,
        default: '/public/default-avatar.png' // defult Avatar
    }
});

const UserModel = mongoose.model('users', userSchema);
export default UserModel;
