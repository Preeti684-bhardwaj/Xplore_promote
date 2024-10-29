const socketIO = require('socket.io');

const allowedOrigins = [
    "https://xplore-instant.vercel.app",
    "https://pre.xplore.xircular.io",
    "http://localhost:5173"
];  

const setupSocket = (server) => {
    const io = socketIO(server, {
        cors: {
            origin: allowedOrigins,
            methods: ["GET", "POST"]
        }
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