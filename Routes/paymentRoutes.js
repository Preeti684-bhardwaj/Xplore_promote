const express = require("express");
const router = express.Router();
const { verifyJWt,verifyAdmin,verifyEndUser,verifySession,authorize } = require("../middleware/auth");
const { 
  createOrder, 
  getOrderById, 
  getUserOrders 
} = require("../Controller/payment/orderController.js");

const { 
  getTransactionById, 
  getTransactionsByOrderId, 
  getTransactionsByUser 
} = require("../Controller/payment/transactionController.js");

const { 
  initiateRefund, 
  checkRefundStatus 
} = require("../Controller/payment/refundController.js");

const { 
  createCashfreeCheckout, 
  getPaymentStatus, 
  getOrderStatus,
  cancelPayment 
} = require("../Controller/payment/cashfree/cashfreeController.js");

const { 
  cashfreeWebhook 
} = require("../Controller/payment/cashfree/cashfreeWebookHandler.js");

// ---------------------Order routes--------------------------------
router.post("/order", verifyEndUser,createOrder);
router.get("/order/:id", verifyEndUser, getOrderById);
router.get("/orders", verifyEndUser, getUserOrders);

// ------------------Transaction routes----------------------------
router.get("/transaction/:id", verifyEndUser, getTransactionById);
router.get("/transactions/order/:orderId", verifyEndUser, getTransactionsByOrderId);
router.get("/transactions", verifyEndUser, getTransactionsByUser);

// ----------------Cashfree checkout routes-----------------------
router.post("/cashfree/checkout", verifyEndUser, createCashfreeCheckout);
router.get("/cashfree/status/:orderId", verifyEndUser, getPaymentStatus);
router.get("/cashfree/order-status", getOrderStatus); // Public route for redirect after payment
router.post("/cashfree/cancel", verifyEndUser, cancelPayment);

// --------------Cashfree webhook route (no authentication as it's called by Cashfree)--------------------
router.post("/cashfree/webhook", cashfreeWebhook);

//----------------Refund routes (admin only)-----------------------------------
router.post("/refund", verifyJWt, initiateRefund);
router.get("/refund/:orderId/:refundId", verifyJWt, checkRefundStatus);

module.exports = router;