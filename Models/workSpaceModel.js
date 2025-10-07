import mongoose from 'mongoose';
const workspaceSchema = new mongoose.Schema({
    workspaceName:{
      type: String,
      required:true,
    },
    userId: {
        type: String,
        required: true,
    },
        createdAt: {
        type: Date,
        default: Date.now,
    },


})

const workspaceModel = mongoose.model('workspace', workspaceSchema);
export default workspaceModel;