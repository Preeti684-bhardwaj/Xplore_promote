const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config({ path: "./.env" });
const app = express();
const cors = require("cors");
const path = require("path");

app.use(cors());

// Specific route for apple-app-site-association file
app.get('/.well-known/apple-app-site-association', (req, res) => {
    res.set('Content-Type', 'application/json');
    res.sendFile(path.join(__dirname, 'public', '.well-known', 'apple-app-site-association'));
});

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
const advertisementRouter = require('./Routes/advertisementRoutes');
const layoutRouter = require('./Routes/layoutRoutes');
const contentRouter = require('./Routes/cdnRoutes');

// Routes declaration
app.use("/v1/user", userRouter);
app.use("/v1/apple", notificationRouter);
app.use("/v1/campaign", campaignRouter);
app.use("/v1/advertisement", advertisementRouter);
app.use("/v1/layout", layoutRouter);
app.use("/v1/content", contentRouter);

module.exports = app;