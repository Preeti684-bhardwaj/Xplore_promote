const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config({ path: "./.env" });
const app = express();
const cors = require("cors");
const passport = require('passport');

app.use(cors())
app.use(express.static("public"));
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));

// Initialize Passport
app.use(passport.initialize());

// Routes Imports
const userRouter = require("./Routes/userRoutes");

// Routes declaration
app.use("/api/v1/user", userRouter);

module.exports = app;