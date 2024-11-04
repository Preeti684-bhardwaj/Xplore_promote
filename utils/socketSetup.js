const socketIO = require('socket.io');

const allowedOrigins =["http://localhost:5173"]

const setupSocket = (server) => {
    const io = socketIO(server, {
        cors: {
            origin: allowedOrigins,
            methods: ["GET", "POST"]
        },
        path: '/socket.io/' // Make sure this matches the nginx location block
    });

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        socket.on('join-qr-channel', (channel) => {
            socket.join(channel);
            console.log(`Client joined channel: ${channel}`);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    return io;
};

module.exports = setupSocket;