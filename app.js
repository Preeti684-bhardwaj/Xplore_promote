const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config({ path: "./.env" });
const app = express();
const cors = require("cors");
const path = require("path");

// Define the allowed origins
const allowedOrigins = [
    "https://xplore-instant.vercel.app",
    "https://pre.xplore.xircular.io",
    "http://localhost:5173/"
];

// Configure CORS middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin, like mobile apps or curl requests
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
}));

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

// Routes Imports
const userRouter = require("./Routes/userRoutes");
const notificationRouter = require("./Routes/notificationRoutes");
const campaignRouter = require('./Routes/campaignRoutes');
// const advertisementRouter = require('./Routes/advertisementRoutes');
const layoutRouter = require('./Routes/layoutRoutes');
const contentRouter = require('./Routes/cdnRoutes');

// Routes declaration
app.use("/v1/user", userRouter);
app.use("/v1/apple", notificationRouter);
app.use("/v1/campaign", campaignRouter);
// app.use("/v1/advertisement", advertisementRouter);
app.use("/v1/layout", layoutRouter);
app.use("/v1/content", contentRouter);

module.exports = app;
