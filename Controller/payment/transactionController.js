const db = require("../../dbConfig/dbConfig.js");
const Order = db.order;
const Transaction = db.transaction;
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");

const createTransaction = asyncHandler(async (data, next) => {
  const dbTransaction = await db.sequelize.transaction();
  
  try {
    // Find the order using the order_id
    const order = await Order.findOne({
      where: { id: data.order_id || data.payment_intent },
      transaction: dbTransaction
    });
    
    if (!order) {
      await dbTransaction.rollback();
      return next(new ErrorHandler("Order not found for the given payment reference", 400));
    }

    // Create the transaction with the orderId
    const transaction = await Transaction.create({
      orderId: order.id,
      amount: parseFloat(data.amount_total || data.order_amount) / 100,
      currency: data.currency || data.order_currency || "INR",
      method: data.payment_method || (data.payment_method_types ? data.payment_method_types[0] : "unknown"),
      status: data.payment_status || data.order_status,
      productDetails: order.productDetails, // Include product details from order
      paymentDetails: {
        intentId: data.payment_intent || data.cf_payment_id,
        status: data.payment_status || data.order_status,
        amount: parseFloat(data.amount_total || data.order_amount) / 100,
        currency: data.currency || data.order_currency || "INR",
        method: data.payment_method || (data.payment_method_types ? data.payment_method_types[0] : "unknown"),
        cf_order_id: data.cf_order_id,
        payment_time: data.payment_time || new Date().toISOString(),
        transaction_id: data.transaction_id
      }
    }, { transaction: dbTransaction });

    // Update order status based on transaction status
    if (data.payment_status === "paid" || data.order_status === "PAID") {
      await order.update({
        status: "paid",
        paymentDetails: {
          ...order.paymentDetails,
          status: "paid",
          payment_id: data.payment_intent || data.cf_payment_id,
          transaction_id: transaction.id
        }
      }, { transaction: dbTransaction });
    } else if (data.payment_status === "failed" || data.order_status === "FAILED") {
      await order.update({
        status: "failed",
        paymentDetails: {
          ...order.paymentDetails,
          status: "failed",
          failure_reason: data.failure_reason || "Payment failed"
        }
      }, { transaction: dbTransaction });
    }

    await dbTransaction.commit();
    console.log("Transaction created successfully:", transaction.id);
    return transaction;
  } catch (error) {
    await dbTransaction.rollback();
    console.error("Error creating transaction:", error);
    return next(new ErrorHandler(error.message || "Error creating transaction", 500));
  }
});

/**
 * Get transaction details by ID
 */
const getTransactionById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return next(new ErrorHandler("Transaction ID is required", 400));
    }
    
    const transaction = await Transaction.findOne({
      where: { id },
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["id", "providerUserId", "date", "status", "campaignId"]
        }
      ]
    });
    
    if (!transaction) {
      return next(new ErrorHandler("Transaction not found", 404));
    }
    
    return res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error("Error fetching transaction:", error);
    return next(new ErrorHandler("Error fetching transaction details", 500));
  }
});

/**
 * Get all transactions for an order
 */
const getTransactionsByOrderId = asyncHandler(async (req, res, next) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return next(new ErrorHandler("Order ID is required", 400));
    }
    
    const transactions = await Transaction.findAll({
      where: { orderId },
      order: [["createdAt", "DESC"]]
    });
    
    return res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return next(new ErrorHandler("Error fetching order transactions", 500));
  }
});

/**
 * Get all transactions for a user
 */
const getTransactionsByUser = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.endUser.id;
    
    // Find all orders for the user
    const orders = await Order.findAll({
      where: { providerUserId: userId },
      attributes: ["id"]
    });
    
    const orderIds = orders.map(order => order.id);
    
    // Find all transactions for these orders
    const transactions = await Transaction.findAll({
      where: { orderId: orderIds },
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["id", "date", "status", "productDetails"]
        }
      ]
    });
    
    return res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    console.error("Error fetching user transactions:", error);
    return next(new ErrorHandler("Error fetching user transactions", 500));
  }
});

module.exports = {
  createTransaction,
  getTransactionById,
  getTransactionsByOrderId,
  getTransactionsByUser
};