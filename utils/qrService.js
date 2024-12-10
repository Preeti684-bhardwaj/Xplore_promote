const db = require("../dbConfig/dbConfig");

// Add a helper function to check if socket is connected to a channel
const isSocketConnected = (io, channel) => {
  const room = io.sockets.adapter.rooms.get(channel);
  return !!room && room.size > 0;
};

// const createQRSession = async (channel, token, os) => {
//   try {
//     await db.qrSessions.create({
//       channel,
//       token,
//       os,
//       createdAt: new Date(),
//     });
//   } catch (error) {
//     console.error(`Failed to create QR session: ${error.message}`, {
//       channel,
//       token,
//       os,
//       errorStack: error.stack
//     });
    
//     // Optionally, you might want to rethrow the error or handle it differently
//     throw error;
//   }
// };

const getQRSession = async (channel, userId) => {
  const channelData = await db.qrSessions.findOne({
    where: { channel: channel },
  });
  // Check if the session was found
  if (!channelData) {
    console.error(`QR Session with channel ${channel} not found.`);
    // You can return a specific response, throw an error, or handle it as per your app’s needs
    throw new Error(`QR Session with channel ${channel} not found.`);
  }
  // Update channel's userId
  channelData.userId = userId;
  channelData.isActiveSession = true;
  await channelData.save();
  return channelData;
};

const deleteQRSession = async (channel, userId) => {
  try {
    // Find the user session by channel and userId
    const userSession = await db.qrSessions.findOne({
      where: { channel, userId },
    });

    // Check if session exists
    if (!userSession) {
      return {
        success: false,
        status: 404,
        message: `session doesn't belongs to user ${userId}`,
      };
    }

    // Check if session is active
    if (!userSession.isActiveSession) {
      return {
        success: false,
        status: 400,
        message: "Session is not active",
      };
    }

    // Check if the session belongs to the requesting user
    if (userSession.userId !== userId) {
      return {
        success: false,
        status: 403,
        message: "Unauthorized access to session",
      };
    }

    // Delete the session with transaction
    await db.sequelize.transaction(async (t) => {
      await db.qrSessions.destroy({
        where: { channel, userId },
        transaction: t,
      });
    });

    // Return success response
    return {
      success: true,
      status: 200,
      message: "User session deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting QR session:", error);
    return {
      success: false,
      status: 500,
      message: error.message || "An error occurred during session deletion",
    };
  }
};

module.exports = {
  isSocketConnected,
  createQRSession,
  getQRSession,
  deleteQRSession,
};
