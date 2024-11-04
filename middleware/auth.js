const db = require("../dbConfig/dbConfig");
const User = db.users;
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "./.env" });

const verifyJWt = async (req, res, next) => {
  try {
    console.log(req.headers);
    
    // Get the token from Authorization header
    const bearerHeader = req.headers["authorization"];

    // Check if bearer header exists
    if (!bearerHeader) {
      return res.status(401).json({
        success: false,
        message: "Access Denied. No token provided.",
      });
    }

    // Extract the token
    // Format in Postman: "Bearer eyJhbGciOiJIUzI1NiIs..."
    const token = bearerHeader.replace("Bearer ", "").trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access Denied. Token is required.",
      });
    }

    // Verify token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    req.decodedToken = decodedToken;

    // Get user ID from token
    const userId = decodedToken.obj.obj.id;

    // Find user
    const user = await User.findOne({
      where: { id: userId },
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token or user not found",
      });
    }

    // Attach user to request
    req.user = user;
    req.token=token;
    // console.log(user,token);
    
    next();
  } catch (error) {
    return res.status(500).send({ success: false, message: error.message });
  }
};

const verifySession=async(req,res,next)=>{
try{
const userId=req.user.id;
const userSession=await db.qrSessions.findOne({userId:userId});
if(!userSession){
  return res.status(404).json({status:false,message:"session expired , Please login again"})
}
  next();
}catch(error){
  return res.status(500).send({ success: false, message: error.message });
}
}

module.exports = { verifyJWt,verifySession };
