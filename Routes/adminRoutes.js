const express = require("express");
const router = express.Router();
const {
 adminSignup,
 adminSignin,
 updateBusinessUser
} = require("../Controller/adminController");
// const { verifyJWt, authorize} = require("../middleware/auth");


router.post("/signUp",adminSignup)
router.post("/login",adminSignin)
// router.post("/password/forgot",forgotPassword)
// router.post("/password/reset/:userId",resetPassword)
// router.get("/getById/:id",getUserById)
router.put('/updateBusinessUser', 
    // verifyJWt,  
    // authorize(["ADMIN"]),
    updateBusinessUser
  );


module.exports = router;