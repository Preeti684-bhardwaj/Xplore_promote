const socketIO = require('socket.io');

const setupSocket = (server) => {
    const io = socketIO(server, {
        cors: {
            origin:'http://localhost:5173',
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    // Store active connections and channels
    const activeConnections = new Map();
    const activeChannels = new Map();

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        
        // Store socket connection
        activeConnections.set(socket.id, {
            socketId: socket.id,
            channels: new Set()
        });

        // Handle joining QR channel
        socket.on('join-qr-channel', (channel) => {
            try {
                // Basic validation
                if (typeof channel !== 'string' || !channel.trim()) {
                    throw new Error('Invalid channel name');
                }

                socket.join(channel);
                activeConnections.get(socket.id).channels.add(channel);
                
                // Update channel members count
                const membersCount = io.sockets.adapter.rooms.get(channel)?.size || 0;
                activeChannels.set(channel, membersCount);

                console.log(`Client ${socket.id} joined channel: ${channel}`);
                
                // Notify channel members
                io.to(channel).emit('channel-update', {
                    channel,
                    message: 'New member joined',
                    membersCount
                });
            } catch (error) {
                socket.emit('error', { message: error.message });
            }
        });

        // Handle QR scan events
        socket.on('qr-scanned', (data) => {
            try {
                // Basic validation
                if (!data || !data.qrId || !data.channel) {
                    throw new Error('Invalid QR scan data');
                }

                // Broadcast scan event to channel
                io.to(data.channel).emit('qr-scan-update', {
                    qrId: data.qrId,
                    scannedBy: socket.id,
                    timestamp: new Date()
                });

            } catch (error) {
                socket.emit('error', { message: error.message });
            }
        });

        // Handle leaving channel
        socket.on('leave-qr-channel', (channel) => {
            try {
                socket.leave(channel);
                activeConnections.get(socket.id)?.channels.delete(channel);
                
                const membersCount = io.sockets.adapter.rooms.get(channel)?.size || 0;
                activeChannels.set(channel, membersCount);

                io.to(channel).emit('channel-update', {
                    channel,
                    message: 'Member left channel',
                    membersCount
                });

                console.log(`Client ${socket.id} left channel: ${channel}`);
            } catch (error) {
                socket.emit('error', { message: error.message });
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
            
            // Get channels the socket was in before disconnecting
            const userChannels = activeConnections.get(socket.id)?.channels || new Set();
            
            // Clean up and notify each channel
            userChannels.forEach(channel => {
                const membersCount = (io.sockets.adapter.rooms.get(channel)?.size || 1) - 1;
                activeChannels.set(channel, membersCount);
                
                io.to(channel).emit('channel-update', {
                    channel,
                    message: 'Member disconnected',
                    membersCount
                });
            });

            // Remove from active connections
            activeConnections.delete(socket.id);
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            socket.emit('error', { message: 'Socket error occurred' });
        });
    });

    return io;
};

module.exports = setupSocket;