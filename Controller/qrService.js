const db = require('../dbConfig/dbConfig');

const createQRSession = async (channel, token) => {
    await db.qrSessions.create({
        channel,
        token,
        createdAt: new Date(),
    });
};

const getQRSession = async (channel) => {
    return await db.qrSessions.findOne({ where: { channel } });
};

const deleteQRSession = async (channel) => {
    await db.qrSessions.destroy({ where: { channel } });
};

module.exports = {
    createQRSession,
    getQRSession,
    deleteQRSession,
};