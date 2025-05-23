const socketIO = require("socket.io");

const allowedOrigins = [
  // "https://xplore-instant.vercel.app",
  // "https://pre.xplore.xircular.io",
  "http://localhost:8080",
  "http://localhost:6160",
  "http://api.xplr.live",
  "https://designer.xplr.live",
  "https://xplr.live",
  "http://localhost:5173",
];

// -----------Setup socket.io server-----------------------------------
const setupSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      // credentials: true // Add this if you need credentials
    },
    path: "/socket.io/",
    transports: ['websocket', 'polling'] // Ensure both transports are available
  });

  io.on("connection", (socket) => {
    console.log(`New connection from ${socket.handshake.headers.origin}`);
    
    console.log("Client connected:", socket.id);

    socket.on("join-qr-channel", (channel) => {
      socket.join(channel);
      console.log(`Client joined channel: ${channel}`);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
};

module.exports = setupSocket;
