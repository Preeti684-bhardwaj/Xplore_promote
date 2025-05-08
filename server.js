const app = require("./app.js");
const { testConnection } = require("./dbConfig/dbEnv.js");
const db = require("./dbConfig/dbConfig.js");
require("dotenv").config({ path: "./.env" });
const passport = require("passport");
const passportJWT = require("passport-jwt");
const setupSocket = require("./utils/socketSetup.js");
const { setupCacheRefreshScheduler } = require("./utils/CacheRefreshScheduler.js")

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});

// JWT Configuration
const ExtractJwt = passportJWT.ExtractJwt;
const JwtStrategy = passportJWT.Strategy;

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
  passReqToCallback: true
};

// JWT Strategy
const strategy = new JwtStrategy(jwtOptions, async (req, jwt_payload, done) => {
  try {
    const Model = jwt_payload.obj.type === "USER" ? db.users : db.admins;
    const user = await Model.findOne({ where: { id: jwt_payload.obj.obj.id } });

    if (user) {
      return done(null, { type: jwt_payload.obj.type, obj: user });
    }
    return done(null, false);
  } catch (error) {
    console.error("JWT Strategy Error:", error);
    return done(error, false);
  }
});
passport.use("jwt", strategy);

// Server initialization
async function startServer() {
  try {
    // Test database connection
    const isConnected = await testConnection(db.sequelize);
    if (!isConnected) {
      throw new Error("Database connection test failed");
    }

    // Sync database
    await db.sequelize.sync({ alter: true });
    console.log("Database synchronized successfully");

    // Start HTTP server
    const server = app.listen(process.env.PORT || 8080, '0.0.0.0', () => {
      console.log(`⚙️ Server is running at port: ${process.env.PORT || 9190}`);
    });

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
}

// Start the server
startServer();
                 