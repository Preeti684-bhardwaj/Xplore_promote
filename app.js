const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config({ path: "./.env" });
const app = express();
const cors = require("cors");
const passport = require('passport');

app.use(cors())
// Serve static files from the 'public' directory
app.use(express.static("public"));

// // Route to serve the app launcher page
// app.get('/launch', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'app-launcher.html'));
// });
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));


// Routes Imports
const userRouter = require("./Routes/userRoutes");
const notificationRouter=require("./Routes/notificationRoutes")
const campaignRouter=require('./Routes/campaignRoutes')
const advertisementRouter=require('./Routes/advertisementRoutes')
const layoutRouter=require('./Routes/layoutRoutes')

// Routes declaration
app.use("/api/v1/user", userRouter);
app.use("/api/v1/apple",notificationRouter)
app.use("/api/v1/campaign",campaignRouter)
app.use("/api/v1/advertisement",advertisementRouter)
app.use("/api/v1/layout",layoutRouter)

module.exports = app;