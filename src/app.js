const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config({ path: "./.env" });
const app = express();
const cors = require("cors");

app.use(cors())



app.use(express.static("public"));
app.use(express.json());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Routes Imports
const userRouter = require("./Routes/userRoutes");


//routes declaration
app.use("/api/v1/user", userRouter);

module.exports = app;