const crypto = require("crypto");
const db = require("../dbConfig/dbConfig");
const {
  // createQRSession,
  getQRSession,
  deleteQRSession,
//   isSocketConnected
} = require("../utils/qrService");
const { getPagination } = require("../validators/campaignValidations");
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler= require("../utils/asyncHandler.js");

// Store active QR sessions
const QR_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes

// --------Generate QR-----------------------------------------
const generateQR = asyncHandler(async (req, res, next) => {
  try {
    // Generate unique token and channel
    const token = crypto.randomBytes(64).toString("hex");
    const timestamp = new Date().toISOString();
    const channelData = `${timestamp}||${token}`;
    const channelHash = crypto
      .createHash("md5")
      .update(channelData)
      .digest("hex");
    const os = req.userOS;

    // Store QR session
    // await createQRSession(channelHash, token, os);
    try {
      await db.qrSessions.create({
        channel:channelHash,
        token:token,
        os:os,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error(`Failed to create QR session: ${error.message}`, {
        channel,
        token,
        os,
        errorStack: error.stack
      });
      return next(new ErrorHandler(error.message, 500));
    }

    return res.status(200).json({
      success: true,
      message: "QR code data generated successfully",
      data: {
        channel: channelHash,
        token: token,
        expiresIn: QR_EXPIRY_TIME,
      },
    });
  } catch (error) {
    console.error("QR Generation Error:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

// -----------------Verify User Login---------------------------------
const verifyQRLogin = asyncHandler(async (req, res, next) => {
  const { channel, token } = req.body;
  const accessToken = req.token;
  const userId = req.user?.id;

  if (!channel || !token) {
    return next(new ErrorHandler("Missing required parameters", 400));
  }
  if (!userId || !accessToken) {
    return next(new ErrorHandler("Unauthorized", 403));
  }

  try {
    const io = req.app.get("io");
    if (!io) {
      throw new Error("Socket.IO instance not found");
    }

    const sessionData = await getQRSession(channel, userId);

    if (!sessionData) {
      return next(new ErrorHandler("QR session expired or not found", 404));
    }

    if (sessionData.token !== token) {
      return next(new ErrorHandler("Invalid token", 401));
    }

    // Wrap socket emission in a Promise to ensure it completes
    const emitLoginEvent = () => {
      return new Promise((resolve, reject) => {
        try {
          io.to(channel).emit("login-event", {
            token,
            accessToken,
            userId,
          });
          console.log("i am emiting login-event");

          // Add a small delay to ensure emission completes
          setTimeout(resolve, 100);
        } catch (error) {
          reject(error);
        }
      });
    };

    // Execute socket emission and session deletion sequentially
    await emitLoginEvent();
    // await deleteQRSession(channel);

    // Log successful emission and deletion
    console.log(`Login event emitted for channel: ${channel}`);
    const sessionInfo = {
      channel: sessionData.channel,
      userId: sessionData.userId,
      os: sessionData.os,
      isActiveSession: sessionData.isActiveSession,
    };

    return res.status(200).json({
      success: true,
      message: "Login verification successful",
      data: { sessionInfo },
    });
  } catch (error) {
    console.error("QR Verification Error:", error);

    // If there's an error, attempt to clean up the session
    try {
      // Call deleteQRSession and handle its response
      const deleteResponse = await deleteQRSession(channel, userId);

      // If deleteQRSession fails, respond with the appropriate message and status
      if (!deleteResponse.success) {
        return res.status(deleteResponse.status).json({
          success: deleteResponse.success,
          message: deleteResponse.message,
        });
      }
    } catch (cleanupError) {
      console.error("Failed to clean up QR session:", cleanupError);
    }

    return next(new ErrorHandler(error.message, 500));
  }
});

// ------------------get QR session----------------------------------------
const getQrSession = asyncHandler(async (req, res, next) => {
  const { page, size } = req.query;
  const { limit, offset } = getPagination(page, size);

  if (!req.user?.id) {
    return next(new ErrorHandler("Unauthorized", 403));
  }

  // Modify condition to filter campaigns by authenticated user
  const condition = {
    userId: req.user?.id,
  };

  try {
    const data = await db.qrSessions.findAndCountAll({
      where: condition,
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      totalItems: data.count,
      sessions: data.rows,
      currentPage: page ? +page : 0,
      totalPages: Math.ceil(data.count / limit),
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return next(new ErrorHandler(error.message,500));
  }
});


module.exports = {
  generateQR,
  verifyQRLogin,
  getQrSession
};
