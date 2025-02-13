const app = require("./app.js");
const { testConnection } = require("./dbConfig/dbEnv.js");
const db = require("./dbConfig/dbConfig.js");
require("dotenv").config();
const setupSocket = require("./utils/socketSetup.js");
let cluster = require('express-cluster');

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

// Server initialization
cluster(async function(worker) {
    try {
      // const app = express();
      // Test database connection
      const isConnected = await testConnection(db.sequelize);
      if (!isConnected) {
        throw new Error("Database connection test failed");
      }
  
      // Sync database
      await db.sequelize.sync({ alter: true });
      console.log("Database synchronized successfully");
      // Start HTTP server
      const server = app.listen(process.env.PORT, function () {
        let host = server.address().address
        let port = server.address().port
   
        console.log("Worker listening at http://%s:%s", host, port); 
    })
  
      // Setup WebSocket
      const io = setupSocket(server);
      app.set("io", io);
  
      // Graceful shutdown
      const shutdown = async () => {
        console.log("Shutting down gracefully...");
        
        try {
          await Promise.all([
            new Promise((resolve) => server.close(resolve)),
            db.sequelize.close()
          ]);
          console.log("Server shutdown completed");
          process.exit(0);
        } catch (err) {
          console.error("Error during shutdown:", err);
          process.exit(1);
        }
      };
  
      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
  
    } catch (error) {
      console.error("Server startup failed:", error);
      process.exit(1);
    }
  }, {count: 4});