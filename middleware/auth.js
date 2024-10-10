const db = require("../dbConfig/dbConfig");
const User = db.users;
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "./.env" })


const verifyJWt = async (req, res, next) => {
    try {
        const token = req.headers["authorization"];
        console.log(token);
        if (!token || token === "null") {
            return res.status(401).send({ message: "No token provided." });
        }
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        req.decodedToken = decodedToken;
        console.log("Decoded Token ID:", req.decodedToken.obj.obj.id);
        const userId = req.decodedToken.obj.obj.id;

        // Find the user by UUID
        const user = await User.findOne({
            where: { id: userId },
            attributes: { exclude: ["password"] },
        });
        if (!user) {
            return res.status(401).send({ success: false, message: "Invalid Access Token or user not found" }
            );
        }

        console.log(user);
        req.user = user;
        next();
    } catch (error) {
        return res.status(500).send({ success: false, message: error.message });
    }
};

module.exports = { verifyJWt };