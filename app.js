const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config({ path: "./.env" });
const app = express();
const cors = require("cors");
// const path = require("path");
const errorMiddleware = require("./middleware/Error");
const metaTagMiddleware = require("./middleware/metaInjection.js");

// Define the allowed origins
const allowedOrigins = [
  "https://xplore-instant.vercel.app",
  "https://pre.xplore.xircular.io",
  "http://localhost:5173",
  "https://xplr.live",
  "http://localhost:3000",
  "http://localhost:6160",
  "https://designer.xplr.live",
  "https://xplore-campaign-app.vercel.app",
];

// Configure CORS middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin, like mobile apps or curl requests
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  })
);

// app.get('/.well-known/assetlinks.json', (req, res) => {
//     res.set('Content-Type', 'application/json');
//     res.sendFile(path.join(__dirname, 'public', '.well-known', 'assetlinks.json'));
// });
// // Specific route for apple-app-site-association file
// app.get('/.well-known/apple-app-site-association', (req, res) => {
//     res.set('Content-Type', 'application/json');
//     res.sendFile(path.join(__dirname, 'public', '.well-known', 'apple-app-site-association'));
// });

// Serve static files from the 'public' directory
app.use(express.static("public"));

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(metaTagMiddleware());

// Routes Imports
const authRouter = require("./Routes/authRoutes");
const userRouter = require("./Routes/userRoutes");
const adminRouter = require("./Routes/adminRoutes");
const endUserRouter = require("./Routes/endUserRoutes");
const notificationRouter = require("./Routes/notificationRoutes");
const campaignRouter = require("./Routes/campaignRoutes");
// const advertisementRouter = require('./Routes/advertisementRoutes');
const layoutRouter = require("./Routes/layoutRoutes");
const contentRouter = require("./Routes/cdnRoutes");
const qrRouter = require("./Routes/qrCodeRoutes");
const clientRouter = require("./Routes/clientRoutes");
const customFontRouter = require("./Routes/customFontRoutes");
const analyticsRouter = require("./Routes/analyticsRoutes");
const productImageRouter = require("./Routes/productImagesRoutes");
const chatBotRouter = require("./Routes/chatRoutes");
const {
  getLayoutByShortCode,
  getPreviewByShortCode,
} = require("./Controller/getShortId");
const {
  handleWebhook,
  webhookEvent,
} = require("./Controller/whatsappWebhook.js");

// Routes declaration
app.use("/v1/auth", authRouter);
app.use("/v1/user", userRouter);
app.use("/v1/admin", adminRouter);
app.use("/v1/endUser", endUserRouter);
app.use("/v1/apple", notificationRouter);
app.use("/v1/campaign", campaignRouter);
// app.use("/v1/advertisement", advertisementRouter);
app.use("/v1/chatBot", chatBotRouter);
app.use("/v1/layout", layoutRouter);
app.use("/v1/content", contentRouter);
app.use("/v1/qr", qrRouter);
app.use("/v1/client", clientRouter);
app.use("/v1/viewLayout/:shortCode", getLayoutByShortCode);
app.use("/v1/font", customFontRouter);
app.use("/v1/analytics", analyticsRouter);
app.use("/v1/product", productImageRouter);
app.get("/v1/preview/*", getPreviewByShortCode);
app.get("/v1/webhook", handleWebhook);
app.post("/v1/webhook", webhookEvent);

// Middleware for error
app.use(errorMiddleware);

module.exports = app;
