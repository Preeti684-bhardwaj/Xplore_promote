const db = require("../../../dbConfig/dbConfig.js");
const Order = db.order;
const Transaction = db.transaction;
const ErrorHandler = require("../../../utils/ErrorHandler.js");
const asyncHandler = require("../../../utils/asyncHandler.js");
const crypto = require("crypto");


const cashfreeWebhook = asyncHandler(async (req, res, next) => {
  try {
    const webhookData = req.body;

    console.log("Received webhook data:", webhookData);
    // const signature = req.headers["x-webhook-signature"];

    // // Verify webhook signature
    // if (!verifyWebhookSignature(webhookData, signature)) {
    //   return next(new ErrorHandler("Invalid webhook signature", 401));
    // }

    // Get the order from database
    const order = await Order.findOne({
      where: { id: webhookData.order_id },
    });

    if (!order) {
      console.error(`Order not found for order_id: ${webhookData.order_id}`);
      return next(new ErrorHandler("Order not found", 404));
    }

    // Handle different webhook events
    switch (webhookData.event_type) {
      case "ORDER_PAID":
        await handleOrderPaid(order, webhookData);
        break;
      case "PAYMENT_FAILED":
        await handlePaymentFailed(order, webhookData);
        break;
      case "PAYMENT_USER_DROPPED":
        await handlePaymentDropped(order, webhookData);
        break;
      default:
        console.log(`Unhandled event type: ${webhookData.event_type}`);
    }

    // Return 200 to acknowledge receipt of webhook
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Always return 200 to acknowledge receipt of webhook even if there's an error
    return res
      .status(200)
      .json({ success: false, message: "Error processing webhook" });
  }
});

/**
 * Verify webhook signature to ensure it's from Cashfree
 */
const verifyWebhookSignature = (webhookData, signature) => {
  try {
    const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;

    if (!webhookSecret || !signature) {
      return false;
    }

    const payload = JSON.stringify(webhookData);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
};

/**
 * Handle successful payment
 */
const handleOrderPaid = async (order, webhookData) => {
  const transaction = await db.sequelize.transaction();

  try {
    // Update order status
    await order.update(
      {
        status: "paid",
        paymentDetails: {
          ...order.paymentDetails,
          order_status: webhookData.order_status,
          payment_time: new Date().toISOString(),
        },
      },
      { transaction }
    );

    // Create transaction record
    await Transaction.create(
      {
        orderId: order.id,
        amount: webhookData.order.order_amount,
        currency: webhookData.order.order_currency,
        method: webhookData.payment.payment_method,
        status: "successful",
        productDetails: order.productDetails,
        paymentDetails: {
          payment_id: webhookData.payment.cf_payment_id,
          payment_method: webhookData.payment.payment_method,
          payment_time: webhookData.payment.payment_time,
          order_id: webhookData.order.order_id,
          cf_order_id: webhookData.order.cf_order_id,
          entity: webhookData.payment.entity,
        },
      },
      { transaction }
    );

    await transaction.commit();
    console.log(`Payment successful for order ${order.id}`);
  } catch (error) {
    await transaction.rollback();
    console.error("Error handling successful payment:", error);
  }
};

/**
 * Handle failed payment
 */
const handlePaymentFailed = async (order, webhookData) => {
  const transaction = await db.sequelize.transaction();

  try {
    // Update order status
    await order.update(
      {
        status: "failed",
        paymentDetails: {
          ...order.paymentDetails,
          order_status: webhookData.order_status,
          failure_reason:
            webhookData.payment.error_details?.error_description ||
            "Payment failed",
        },
      },
      { transaction }
    );

    // Create transaction record
    await Transaction.create(
      {
        orderId: order.id,
        amount: webhookData.order.order_amount,
        currency: webhookData.order.order_currency,
        method: webhookData.payment.payment_method || "unknown",
        status: "failed",
        productDetails: order.productDetails,
        paymentDetails: {
          payment_id: webhookData.payment.cf_payment_id,
          payment_method: webhookData.payment.payment_method,
          failure_reason:
            webhookData.payment.error_details?.error_description ||
            "Payment failed",
          order_id: webhookData.order.order_id,
          cf_order_id: webhookData.order.cf_order_id,
          entity: webhookData.payment.entity,
        },
      },
      { transaction }
    );

    await transaction.commit();
    console.log(`Payment failed for order ${order.id}`);
  } catch (error) {
    await transaction.rollback();
    console.error("Error handling failed payment:", error);
  }
};

/**
 * Handle payment dropped by user
 */
const handlePaymentDropped = async (order, webhookData) => {
  try {
    // Update order status
    await order.update({
      status: "failed",
      paymentDetails: {
        ...order.paymentDetails,
        order_status: webhookData.order_status,
        failure_reason: "Payment dropped by user",
      },
    });

    console.log(`Payment dropped for order ${order.id}`);
  } catch (error) {
    console.error("Error handling dropped payment:", error);
  }
};

module.exports = {
  cashfreeWebhook,
};
