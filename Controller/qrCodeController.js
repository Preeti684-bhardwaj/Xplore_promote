const crypto = require('crypto');
const { createQRSession, getQRSession, deleteQRSession } = require('./qrService');

// Store active QR sessions
const QR_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes

const generateQR = async (req, res) => {
    try {
        // Generate unique token and channel
        const token = crypto.randomBytes(64).toString('hex');
        const timestamp = new Date().toISOString();
        const channelData = `${timestamp}||${token}`;
        const channelHash = crypto.createHash('md5').update(channelData).digest('hex');

        // Store QR session
        await createQRSession(channelHash, token);

        return res.status(200).json({
            success: true,
            message: "QR code data generated successfully",
            data: {
                channel: channelHash,
                token: token,
                expiresIn: QR_EXPIRY_TIME
            }
        });
    } catch (error) {
        console.error('QR Generation Error:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate QR code",
            error: error.message
        });
    }
};

const verifyQRLogin = async (req, res) => {
    const { channel, token } = req.body;
    const accessToken = req.token;
    const userId = req.user.id;

    if (!channel || !token) {
        return res.status(400).json({
            success: false,
            message: "Missing required parameters"
        });
    }

    try {
        const io = req.app.get('io');
        if (!io) {
            throw new Error('Socket.IO instance not found');
        }

        const sessionData = await getQRSession(channel);
        
        if (!sessionData) {
            return res.status(404).json({
                success: false,
                message: "QR session expired or not found"
            });
        }

        if (sessionData.token !== token) {
            return res.status(401).json({
                success: false,
                message: "Invalid token"
            });
        }

        // Wrap socket emission in a Promise to ensure it completes
        const emitLoginEvent = () => {
            return new Promise((resolve, reject) => {
                try {
                    io.to(channel).emit('login-event', {
                        token,
                        accessToken,
                        userId
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

        return res.status(200).json({
            success: true,
            message: "Login verification successful",
            data: { userId }
        });
    } catch (error) {
        console.error('QR Verification Error:', error);
        
        // If there's an error, attempt to clean up the session
        try {
            await deleteQRSession(channel);
        } catch (cleanupError) {
            console.error('Failed to clean up QR session:', cleanupError);
        }

        return res.status(500).json({
            success: false,
            message: "Failed to verify login",
            error: error.message
        });
    }
};

// Add a helper function to check if socket is connected to a channel
const isSocketConnected = (io, channel) => {
    const room = io.sockets.adapter.rooms.get(channel);
    return !!room && room.size > 0;
};

module.exports = {
    generateQR,
    verifyQRLogin,
    isSocketConnected
};