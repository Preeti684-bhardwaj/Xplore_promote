const express = require("express");
require("dotenv").config();
const app = express();
const cors = require("cors");
const errorMiddleware = require("./middleware/Error");

// allowed origins
const allowedOrigins = [
  "https://xplore-instant.vercel.app",
  "https://pre.xplore.xircular.io",
  "http://localhost:5173",
  "https://xplr.live",
  "http://localhost:3000",
  "http://localhost:6161",
  "https://designer.xplr.live",
  "https://xplore-campaign-app.vercel.app"
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

// Serve static files from the 'public' directory
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes Imports
const authRouter = require("./Routes/authRoutes");
const userRouter = require("./Routes/userRoutes");
const adminRouter = require("./Routes/adminRoutes");
const endUserRouter = require("./Routes/endUserRoutes");
const notificationRouter = require("./Routes/notificationRoutes");
const campaignRouter = require("./Routes/campaignRoutes");
const layoutRouter = require("./Routes/layoutRoutes");
const contentRouter = require("./Routes/cdnRoutes");
const qrRouter = require("./Routes/qrCodeRoutes");
const clientRouter = require("./Routes/clientRoutes");
const customFontRouter = require("./Routes/customFontRoutes");
const analyticsRouter = require("./Routes/analyticsRoutes");
const productImageRouter = require("./Routes/productImagesRoutes");
const chatBotRouter = require("./Routes/chatRoutes");
const {getLayoutByShortCode} = require("./Controller/getShortId");
const {handleWebhook,webhookEvent} = require("./Controller/user/whatsapp/whatsappWebhook.js");
const paymentRouter=require("./Routes/paymentRoutes.js");
const collectionRouter = require("./Routes/collectionRoutes.js");
const productRouter=require("./Routes/productRoutes.js");
const inventoryRouter=require("./Routes/inventoryRoutes.js");
const tagsRouter=require("./Routes/tagRoutes.js")
const subscriptionRouter = require("./Routes/subscriptionRoutes.js");

// Routes declaration
app.use("/v1/auth", authRouter);
app.use("/v1/user", userRouter);
app.use("/v1/admin", adminRouter);
app.use("/v1/endUser", endUserRouter);
app.use("/v1/apple", notificationRouter);
app.use("/v1/campaign", campaignRouter);
app.use("/v1/chatBot", chatBotRouter);
app.use("/v1/layout", layoutRouter);
app.use("/v1/content", contentRouter);
app.use("/v1/qr", qrRouter);
app.use("/v1/client", clientRouter);
app.use("/v1/viewLayout/:shortCode", getLayoutByShortCode);
app.use("/v1/font", customFontRouter);
app.use("/v1/analytics", analyticsRouter);
app.use("/v1/product_image", productImageRouter);
app.get("/v1/webhook", handleWebhook);
app.post("/v1/webhook", webhookEvent);
app.use("/v1/payment",paymentRouter);
app.use("/v1/collection", collectionRouter);
app.use("/v1/product",productRouter);
app.use("/v1/inventory", inventoryRouter);
app.use("/v1/tags", tagsRouter);
app.use("/v1/subscription", subscriptionRouter);
// Middleware for error
app.use(errorMiddleware);

module.exports = app;
