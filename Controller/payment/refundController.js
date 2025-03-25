const db = require("../../dbConfig/dbConfig.js");
const Order = db.order;
const Transaction = db.transaction;
const Campaign = db.campaigns;
const CashfreeConfig = db.cashfreeConfig;
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");
const axios = require("axios");


const initiateRefund = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { orderId, refundAmount, refundNote } = req.body;
    const userId = req.user.id; // Admin/provider user
    
    if (!orderId) {
      await transaction.rollback();
      return next(new ErrorHandler("Order ID is required", 400));
    }
    
    // Find the order
    const order = await Order.findOne({
      where: { id: orderId },
      transaction
    });
    
    if (!order) {
      await transaction.rollback();
      return next(new ErrorHandler("Order not found", 404));
    }
    
    // Check if order is paid
    if (order.status !== "paid") {
      await transaction.rollback();
      return next(new ErrorHandler("Only paid orders can be refunded", 400));
    }
    
    // Check if there's a transaction for this order
    const orderTransaction = await Transaction.findOne({
      where: { 
        orderId: order.id,
        status: "successful"
      },
      transaction
    });
    
    if (!orderTransaction) {
      await transaction.rollback();
      return next(new ErrorHandler("No successful transaction found for this order", 404));
    }
    
    // Find the campaign with its Cashfree configuration
    const campaign = await Campaign.findOne({
      where: { campaignID: order.campaignId },
      include: [
        {
          model: CashfreeConfig,
          as: "payment",
          attributes: ["id", "XClientId", "XClientSecret"]
        }
      ],
      transaction
    });
    
    if (!campaign || !campaign.payment || campaign.payment.length === 0) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign or payment configuration not found", 404));
    }
    
    // Get Cashfree configuration
    const cashfreeConfig = campaign.payment[0];
    
    // Get payment details
    const paymentId = orderTransaction.paymentDetails.payment_id;
    if (!paymentId) {
      await transaction.rollback();
      return next(new ErrorHandler("Payment ID not found in transaction", 400));
    }
    
    // Validate refund amount
    const amount = refundAmount || orderTransaction.amount;
    if (amount <= 0 || amount > orderTransaction.amount) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid refund amount", 400));
    }
    
    // Generate refund ID
    const refundId = `refund_${orderId}_${Date.now()}`;
    
    // Prepare refund request to Cashfree
    const apiUrl = process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg";
    const apiVersion = process.env.CASHFREE_API_VERSION || "2022-09-01";
    
    const refundData = {
      refund_id: refundId,
      refund_amount: amount,
      refund_note: refundNote || "Refund for order",
    };
    
    // Call Cashfree API to initiate refund
    const response = await axios({
      method: "POST",
      url: `${apiUrl}/orders/${order.id}/refunds`,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-api-version": apiVersion,
        "x-client-id": cashfreeConfig.XClientId,
        "x-client-secret": cashfreeConfig.XClientSecret
      },
      data: refundData
    });
    
    // Create a refund transaction record
    await Transaction.create({
      orderId: order.id,
      amount: -amount, // Negative amount for refund
      currency: orderTransaction.currency,
      method: "refund",
      status: response.data.refund_status || "processing",
      productDetails: orderTransaction.productDetails,
      paymentDetails: {
        refund_id: refundId,
        payment_id: paymentId,
        order_id: order.id,
        refund_amount: amount,
        refund_note: refundNote || "Refund for order",
        refund_status: response.data.refund_status,
        refund_time: new Date().toISOString(),
        processed_by: userId
      }
    }, { transaction });
    
    // Update order payment details
    await order.update({
      paymentDetails: {
        ...order.paymentDetails,
        refund_status: response.data.refund_status,
        refund_id: refundId,
        refund_amount: amount,
        refund_time: new Date().toISOString()
      }
    }, { transaction });
    
    await transaction.commit();
    
    return res.status(200).json({
      success: true,
      data: {
        refund_id: refundId,
        order_id: order.id,
        refund_amount: amount,
        refund_status: response.data.refund_status
      }
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error("Refund error:", error.response ? error.response.data : error.message);
    return next(new ErrorHandler(error.response ? error.response.data.message : error.message, 500));
  }
});

const checkRefundStatus = asyncHandler(async (req, res, next) => {
  try {
    const { orderId, refundId } = req.params;
    
    if (!orderId || !refundId) {
      return next(new ErrorHandler("Order ID and Refund ID are required", 400));
    }
    
    // Find the order
    const order = await Order.findOne({
      where: { id: orderId }
    });
    
    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }
    
    // Find the campaign with its Cashfree configuration
    const campaign = await Campaign.findOne({
      where: { campaignID: order.campaignId },
      include: [
        {
          model: CashfreeConfig,
          as: "payment",
          attributes: ["id", "XClientId", "XClientSecret"]
        }
      ]
    });
    
    if (!campaign || !campaign.payment || campaign.payment.length === 0) {
      return next(new ErrorHandler("Campaign or payment configuration not found", 404));
    }
    
    // Get Cashfree configuration
    const cashfreeConfig = campaign.payment[0];
    
    // Prepare refund status check
    const apiUrl = process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg";
    const apiVersion = process.env.CASHFREE_API_VERSION || "2022-09-01";
    
    // Call Cashfree API to check refund status
    const response = await axios({
      method: "GET",
      url: `${apiUrl}/orders/${orderId}/refunds/${refundId}`,
      headers: {
        "Accept": "application/json",
        "x-api-version": apiVersion,
        "x-client-id": cashfreeConfig.XClientId,
        "x-client-secret": cashfreeConfig.XClientSecret
      }
    });
    
    // Find the refund transaction
    const refundTransaction = await Transaction.findOne({
      where: {
        orderId: order.id,
        method: "refund",
        "paymentDetails.refund_id": refundId
      }
    });
    
    // Update refund transaction status if found
    if (refundTransaction) {
      await refundTransaction.update({
        status: response.data.refund_status,
        paymentDetails: {
          ...refundTransaction.paymentDetails,
          refund_status: response.data.refund_status,
          refund_processed_at: response.data.processed_at,
          refund_utr: response.data.utr
        }
      });
    }
    
    // Update order payment details
    await order.update({
      paymentDetails: {
        ...order.paymentDetails,
        refund_status: response.data.refund_status,
        refund_processed_at: response.data.processed_at,
        refund_utr: response.data.utr
      }
    });
    
    return res.status(200).json({
      success: true,
      data: {
        refund_id: refundId,
        order_id: orderId,
        refund_status: response.data.refund_status,
        refund_amount: response.data.refund_amount,
        refund_processed_at: response.data.processed_at,
        refund_utr: response.data.utr
      }
    });
    
  } catch (error) {
    console.error("Refund status check error:", error.response ? error.response.data : error.message);
    return next(new ErrorHandler(error.response ? error.response.data.message : error.message, 500));
  }
});

module.exports = {
  initiateRefund,
  checkRefundStatus
};