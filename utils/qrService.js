const db = require('../dbConfig/dbConfig');

const createQRSession = async (channel, token) => {
    await db.qrSessions.create({
        channel,
        token,
        createdAt: new Date(),
    });
};

const getQRSession = async (channel,userId) => {
    const channelData= await db.qrSessions.findOne({ where: { channel } });
     // Update channel's userId
     channelData.userId = userId;
     // Save the updated channel
     await channelData.save();
    return channelData;
};

const deleteQRSession = async (channel) => {
    await db.qrSessions.destroy({ where: { channel } });
};

module.exports = {
    createQRSession,
    getQRSession,
    deleteQRSession,
};