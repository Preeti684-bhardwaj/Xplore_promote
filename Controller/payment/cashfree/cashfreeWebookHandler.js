// const db = require("../../../dbConfig/dbConfig.js");
// const Order = db.order;
// const Transaction = db.transaction;
// const ErrorHandler = require("../../../utils/ErrorHandler.js");
// const asyncHandler = require("../../../utils/asyncHandler.js");
// const crypto = require("crypto");



// const cashfreeWebhook = asyncHandler(async (req, res, next) => {
//   try {
//     const webhookData = req.body;

//     console.log("Received webhook data:", webhookData);
//     // const signature = req.headers["x-webhook-signature"];

//     // // Verify webhook signature
//     // if (!verifyWebhookSignature(webhookData, signature)) {
//     //   return next(new ErrorHandler("Invalid webhook signature", 401));
//     // }

//     // Get the order from database
//     const order = await Order.findOne({
//       where: { id: webhookData.order_id },
//     });

//     if (!order) {
//       console.error(`Order not found for order_id: ${webhookData.order_id}`);
//       return next(new ErrorHandler("Order not found", 404));
//     }

//     // Handle different webhook events
//     switch (webhookData.event_type) {
//       case "ORDER_PAID":
//         await handleOrderPaid(order, webhookData);
//         break;
//       case "PAYMENT_FAILED":
//         await handlePaymentFailed(order, webhookData);
//         break;
//       case "PAYMENT_USER_DROPPED":
//         await handlePaymentDropped(order, webhookData);
//         break;
//       default:
//         console.log(`Unhandled event type: ${webhookData.event_type}`);
//     }

//     // Return 200 to acknowledge receipt of webhook
//     return res.status(200).json({ success: true });
//   } catch (error) {
//     console.error("Webhook processing error:", error);
//     // Always return 200 to acknowledge receipt of webhook even if there's an error
//     return res
//       .status(200)
//       .json({ success: false, message: "Error processing webhook" });
//   }
// });

// /**
//  * Verify webhook signature to ensure it's from Cashfree
//  */
// const verifyWebhookSignature = (webhookData, signature) => {
//   try {
//     const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;

//     if (!webhookSecret || !signature) {
//       return false;
//     }

//     const payload = JSON.stringify(webhookData);
//     const expectedSignature = crypto
//       .createHmac("sha256", webhookSecret)
//       .update(payload)
//       .digest("hex");

//     return crypto.timingSafeEqual(
//       Buffer.from(signature),
//       Buffer.from(expectedSignature)
//     );
//   } catch (error) {
//     console.error("Signature verification error:", error);
//     return false;
//   }
// };

// /**
//  * Handle successful payment
//  */
// const handleOrderPaid = async (order, webhookData) => {
//   const transaction = await db.sequelize.transaction();

//   try {

//     if (order.status === "paid" || order.status === "shipped") {
//       console.log(`Order ${order.id} already processed`);
//       await transaction.commit();
//       return;
//     }
//     // Update order status
//     await order.update(
//       {
//         status: "paid",
//         paymentDetails: {
//           ...order.paymentDetails,
//           order_status: webhookData.order_status,
//           payment_time: new Date().toISOString(),
//         },
//       },
//       { transaction }
//     );

//     // Create transaction record
//     await Transaction.create(
//       {
//         orderId: order.id,
//         amount: webhookData.order.order_amount,
//         currency: webhookData.order.order_currency,
//         method: webhookData.payment.payment_method,
//         status: "successful",
//         productDetails: order.productDetails,
//         paymentDetails: {
//           payment_id: webhookData.payment.cf_payment_id,
//           payment_method: webhookData.payment.payment_method,
//           payment_time: webhookData.payment.payment_time,
//           order_id: webhookData.order.order_id,
//           cf_order_id: webhookData.order.cf_order_id,
//           entity: webhookData.payment.entity,
//         },
//       },
//       { transaction }
//     );

//     await transaction.commit();
//     console.log(`Payment successful for order ${order.id}`);
//   } catch (error) {
//     await transaction.rollback();
//     console.error("Error handling successful payment:", error);
//   }
// };

// /**
//  * Handle failed payment
//  */
// const handlePaymentFailed = async (order, webhookData) => {
//   const transaction = await db.sequelize.transaction();

//   try {
//     // Update order status
//     await order.update(
//       {
//         status: "failed",
//         paymentDetails: {
//           ...order.paymentDetails,
//           order_status: webhookData.order_status,
//           failure_reason:
//             webhookData.payment.error_details?.error_description ||
//             "Payment failed",
//         },
//       },
//       { transaction }
//     );

//     // Create transaction record
//     await Transaction.create(
//       {
//         orderId: order.id,
//         amount: webhookData.order.order_amount,
//         currency: webhookData.order.order_currency,
//         method: webhookData.payment.payment_method || "unknown",
//         status: "failed",
//         productDetails: order.productDetails,
//         paymentDetails: {
//           payment_id: webhookData.payment.cf_payment_id,
//           payment_method: webhookData.payment.payment_method,
//           failure_reason:
//             webhookData.payment.error_details?.error_description ||
//             "Payment failed",
//           order_id: webhookData.order.order_id,
//           cf_order_id: webhookData.order.cf_order_id,
//           entity: webhookData.payment.entity,
//         },
//       },
//       { transaction }
//     );

//     await transaction.commit();
//     console.log(`Payment failed for order ${order.id}`);
//   } catch (error) {
//     await transaction.rollback();
//     console.error("Error handling failed payment:", error);
//   }
// };

// /**
//  * Handle payment dropped by user
//  */
// const handlePaymentDropped = async (order, webhookData) => {
//   try {
//     // Update order status
//     await order.update({
//       status: "failed",
//       paymentDetails: {
//         ...order.paymentDetails,
//         order_status: webhookData.order_status,
//         failure_reason: "Payment dropped by user",
//       },
//     });

//     console.log(`Payment dropped for order ${order.id}`);
//   } catch (error) {
//     console.error("Error handling dropped payment:", error);
//   }
// };

// module.exports = {
//   cashfreeWebhook,
// };



const db = require("../../../dbConfig/dbConfig.js");
const Order = db.order;
const Transaction = db.transaction;
const Product = db.Product;
const ShippingDetail = db.ShippingDetail;
const ProductVariant = db.ProductVariant;
const Inventory = db.Inventory;
const Campaign = db.campaigns
const CashfreeConfig = db.cashfreeConfig
const FailedRefunds = db.FailedRefunds
const ErrorHandler = require("../../../utils/ErrorHandler.js");
const asyncHandler = require("../../../utils/asyncHandler.js");
const crypto = require("crypto");
const axios = require("axios");
const { createShipment } = require("../../../utils/shipRocket.js")

const cashfreeWebhook = asyncHandler(async (req, res, next) => {
  try {

    const webhookData = req.body;
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];

    console.log("webhook data" , webhookData)

    // Verify webhook signature
    if (!verifyWebhookSignature(webhookData, signature , timestamp)) {
      return next(new ErrorHandler("Invalid webhook signature", 401));
    }

    // Get the order from database
    const order = await Order.findOne({
      where: { id: webhookData?.data?.order?.order_id },
    });

    if (!order) {
      console.error(`Order not found for order_id: ${webhookData?.data?.order?.order_id}`);
      return next(new ErrorHandler("Order not found", 404));
    }

    // Handle different webhook events
    switch (webhookData.type) {
      case "PAYMENT_SUCCESS_WEBHOOK":
        await handleOrderPaid(order, webhookData.data);
        break;
      case "PAYMENT_FAILED_WEBHOOK":
        await handlePaymentFailed(order, webhookData.data);
        break;
      case "PAYMENT_USER_DROPPED_WEBHOOK":
        await handlePaymentDropped(order, webhookData.data);
        break;
      default:
        console.log(`Unhandled event type: ${webhookData.event_type}`);
    }

    // Always return 200 to acknowledge receipt
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(200).json({ success: false, message: "Error processing webhook" });
  }
});

/**
 * Verify webhook signature
 */
const verifyWebhookSignature = (webhookData, signature , timestamp) => {
  try {
    const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;
    if (!webhookSecret || !signature) {
      return false;
    }

    const payload = timestamp + JSON.stringify(webhookData);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(payload)
      .digest("base64");

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
 * Check if refund already initiated
 */
const hasRefundInitiated = async (orderId, transaction) => {
  const refund = await Transaction.findOne({
    where: {
      orderId,
      method: "refund",
      status: { [db.Sequelize.Op.in]: ["initiated", "successful"] },
    },
    transaction,
  });
  return !!refund;
};

/**
 * Log failed refund
 */
const logFailedRefund = async (orderId, amount, reason, transaction) => {
  await FailedRefunds.create(
    {
      orderId,
      amount,
      reason,
    },
    { transaction }
  );
  // Mock admin notification (replace with email/SMS)
  console.error(`ALERT: Refund failed for order ${orderId} after retries. Amount: ${amount}, Reason: ${reason}`);
};

/**
 * Initiate a refund with retry
 */
const initiateRefund = async (order, paymentId, amount, transaction) => {
  console.log("Initiate refund calling")
  if (await hasRefundInitiated(order.id, transaction)) {
    console.log(`Refund already initiated for order ${order.id}`);
    return { refund_id: "existing" };
  }

  console.log("Refund not done yet early")

  const maxRetries = 3;
  const baseDelay = 1000; // 1 second

  const attemptRefund = async (retryCount) => {
    try {
      const refundPayload = {
        refund_id: `REF-${order.id}-${Date.now()}`,
        refund_amount: amount,
        refund_note: `Refund for order ${order.id} due to processing failure`,
      };

      const campaign = await Campaign.findOne({
        where: { campaignID: order.campaignId },
        include: [
          {
            model: CashfreeConfig,
            as: "payment",
            attributes: ["id", "XClientId", "XClientSecret"],
          },
        ],
        transaction,
      });

      if (!campaign) {
        throw new Error("Campaign not found");
      }

      const cashfreeConfig = campaign.payment[0];
      const apiVersion = process.env.CASHFREE_API_VERSION || "2022-09-01";

      const response = await axios.post(
        `${process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg"}/orders/${order.paymentDetails.cf_order_id}/refunds`,
        refundPayload,
        {
          headers: {
            "x-api-version": apiVersion,
            "x-client-id": cashfreeConfig.XClientId,
            "x-client-secret": cashfreeConfig.XClientSecret,
            "Content-Type": "application/json",
          },
        }
      );

      await Transaction.create(
        {
          orderId: order.id,
          amount: amount,
          currency: "INR",
          method: "refund",
          status: "initiated",
          productDetails: { productId: order.productId, variantId: order.variantId },
          paymentDetails: {
            refund_id: response.data.refund_id,
            order_id: order.id,
            cf_order_id: order.paymentDetails.cf_order_id,
            payment_id: paymentId,
            refund_status: response.data.status,
          },
        },
        { transaction }
      );

      return response.data;
    } catch (error) {
      console.error(`Refund attempt ${retryCount + 1} failed for order ${order.id}:`, error.response ? error.response.data : error.message);
      if (retryCount < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`Retrying refund after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptRefund(retryCount + 1);
      }
      await logFailedRefund(order.id, amount, "Refund failed after retries", transaction);
      console.error("Refund logs after multiple retries")
    }
  };

  return attemptRefund(0);
};

/**
 * Handle successful payment
 */
const handleOrderPaid = async (order, webhookData) => {
  const transaction = await db.sequelize.transaction();

  try {

    if (order.status === "paid" || order.status === "shipped" || order.status === "delivered") {
      console.log(`Order ${order.id} already processed`);
      await transaction.commit();
      return;
    }

    // Check reservation expiry
    if (order.reservationExpiry && new Date() > order.reservationExpiry) {
      await order.update(
        {
          status: "failed",
          paymentDetails: {
            ...order.paymentDetails,
            order_status: webhookData.payment.payment_status,
            failure_reason: "Reservation expired",
          },
        },
        { transaction }
      );
      await Transaction.create(
        {
          orderId: order.id,
          amount: webhookData.order.order_amount,
          currency: webhookData.order.order_currency,
          method: webhookData.payment.payment_method || "unknown",
          status: "failed",
          paymentDetails: {
            payment_id: webhookData.payment.cf_payment_id,
            payment_method: webhookData.payment.payment_method,
            payment_time: webhookData.payment.payment_time,
            order_id: webhookData.order.order_id,
            cf_order_id: webhookData.order?.cf_order_id,
            entity: webhookData.payment?.entity,
            failure_reason: "Reservation expired",
          },
        },
        { transaction }
      );
      await initiateRefund(
        order,
        webhookData.payment.cf_payment_id,
        webhookData.order.order_amount,
        transaction
      );
      await transaction.commit();
      console.error("Error proccessing webhook:- Reservation expired")
    }

    // Fetch product and variant
    const product = await Product.findByPk(order.productId, {
      include: [
        {
          model: ProductVariant,
          where: { id: order.variantId },
          required: true,
          include: [{ model: Inventory }],
        },
      ],
      transaction,
    });

    if (!product) {
      await order.update(
        {
          status: "failed",
          paymentDetails: {
            ...order.paymentDetails,
            order_status: webhookData.payment.payment_status,
            failure_reason: "Product not found",
            payment:{
              ...webhookData.payment
            },
            customer_details: {
              ...webhookData.customer_details
            },
            payment_gateway_details: {
              ...webhookData.payment_gateway_details
            }
          },
        },
        { transaction }
      );
      await Transaction.create(
        {
          orderId: order.id,
          amount: webhookData.order.order_amount,
          currency: webhookData.order.order_currency,
          method: webhookData.payment.payment_method || "unknown",
          status: "failed",
          paymentDetails: {
            payment_id: webhookData.payment.cf_payment_id,
            payment_method: webhookData.payment.payment_method,
            payment_time: webhookData.payment.payment_time,
            order_id: webhookData.order.order_id,
            cf_order_id: webhookData.order?.cf_order_id,
            entity: webhookData.payment?.entity,
            failure_reason: "Product not found",
          },
        },
        { transaction }
      );
      await initiateRefund(
        order,
        webhookData.payment.cf_payment_id,
        webhookData.order.order_amount,
        transaction
      );
      await transaction.commit();
      console.error("Error proccessing webhook:- Product not found")
    }

    // Handle physical products
    if (order.productType === "physical") {
      const shippingDetails = await ShippingDetail.findOne({
        where: { orderId: order.id },
        transaction,
      });

      if (!shippingDetails || !shippingDetails.name || !shippingDetails.address ||
          !shippingDetails.city || !shippingDetails.pincode || !shippingDetails.phone) {
        await order.update(
          {
            status: "failed",
            paymentDetails: {
              ...order.paymentDetails,
              order_status: webhookData.payment.payment_status,
              failure_reason: "Incomplete shipping details",
              payment:{
                ...webhookData.payment
              },
              customer_details: {
                ...webhookData.customer_details
              },
              payment_gateway_details: {
                ...webhookData.payment_gateway_details
              }
            },
          },
          { transaction }
        );
        await Transaction.create(
          {
            orderId: order.id,
            amount: webhookData.order.order_amount,
            currency: webhookData.order.order_currency,
            method: webhookData.payment.payment_method || "unknown",
            status: "failed",
            paymentDetails: {
              payment_id: webhookData.payment.cf_payment_id,
              payment_method: webhookData.payment.payment_method,
              payment_time: webhookData.payment.payment_time,
              order_id: webhookData.order.order_id,
              cf_order_id: webhookData.order?.cf_order_id,
              entity: webhookData.payment?.entity,
              failure_reason: "Incomplete shipping details",
            },
          },
          { transaction }
        );
        await initiateRefund(
          order,
          webhookData.payment.cf_payment_id,
          webhookData.order.order_amount,
          transaction
        );
        await transaction.commit();
        console.error("Error proccessing webhook:- Incomplete shopping details")
      }

      // Verify stock
      if (!order.inventoryId) {
        await order.update(
          {
            status: "failed",
            paymentDetails: {
              ...order.paymentDetails,
              order_status: webhookData.payment.payment_status,
              failure_reason: "No inventory assigned",
              payment:{
                ...webhookData.payment
              },
              customer_details: {
                ...webhookData.customer_details
              },
              payment_gateway_details: {
                ...webhookData.payment_gateway_details
              }
            },
          },
          { transaction }
        );
        await Transaction.create(
          {
            orderId: order.id,
            amount: webhookData.order.order_amount,
            currency: webhookData.order.order_currency,
            method: webhookData.payment.payment_method || "unknown",
            status: "failed",
            paymentDetails: {
              payment_id: webhookData.payment.cf_payment_id,
              payment_method: webhookData.payment.payment_method,
              payment_time: webhookData.payment.payment_time,
              order_id: webhookData.order.order_id,
              cf_order_id: webhookData?.order?.cf_order_id,
              entity: webhookData.payment?.entity,
              failure_reason: "No inventory assigned",
            },
          },
          { transaction }
        );
        await initiateRefund(
          order,
          webhookData.payment.cf_payment_id,
          webhookData.order.order_amount,
          transaction
        );
        await transaction.commit();
        console.error("Error proccessing webhook:- No inventory assigned")
      }

      const inventory = await Inventory.findByPk(order.inventoryId, { transaction });
      if (!inventory) {
        await order.update(
          {
            status: "failed",
            paymentDetails: {
              ...order.paymentDetails,
              order_status: webhookData.payment.payment_status,
              failure_reason: "Inventory not found",
              payment:{
                ...webhookData.payment
              },
              customer_details: {
                ...webhookData.customer_details
              },
              payment_gateway_details: {
                ...webhookData.payment_gateway_details
              }
            },
          },
          { transaction }
        );
        await Transaction.create(
          {
            orderId: order.id,
            amount: webhookData.order.order_amount,
            currency: webhookData.order.order_currency,
            method: webhookData.payment.payment_method || "unknown",
            status: "failed",
            paymentDetails: {
              payment_id: webhookData.payment.cf_payment_id,
              payment_method: webhookData.payment.payment_method,
              payment_time: webhookData.payment.payment_time,
              order_id: webhookData.order.order_id,
              cf_order_id: webhookData.order?.cf_order_id,
              entity: webhookData.payment?.entity,
              failure_reason: "Inventory not found",
            },
          },
          { transaction }
        );
        await initiateRefund(
          order,
          webhookData.payment.cf_payment_id,
          webhookData.order.order_amount,
          transaction
        );
        await transaction.commit();
        console.error("Error proccessing webhook:- Inventory not found")
      }

      if (inventory.quantity < order.quantity || inventory.reservedQuantity < order.quantity) {
        await order.update(
          {
            status: "failed",
            paymentDetails: {
              ...order.paymentDetails,
              order_status: webhookData.payment.payment_status,
              failure_reason: `Insufficient stock: only ${inventory.quantity} item(s) available`,
              payment:{
                ...webhookData.payment
              },
              customer_details: {
                ...webhookData.customer_details
              },
              payment_gateway_details: {
                ...webhookData.payment_gateway_details
              }
            },
          },
          { transaction }
        );
        await Transaction.create(
          {
            orderId: order.id,
            amount: webhookData.order.order_amount,
            currency: webhookData.order.order_currency,
            method: webhookData.payment.payment_method || "unknown",
            status: "failed",
            paymentDetails: {
              payment_id: webhookData.payment.cf_payment_id,
              payment_method: webhookData.payment.payment_method,
              payment_time: webhookData.payment.payment_time,
              order_id: webhookData.order.order_id,
              cf_order_id: webhookData.order?.cf_order_id,
              entity: webhookData.payment?.entity,
              failure_reason: `Insufficient stock: only ${inventory.quantity} item(s) available`,
            },
          },
          { transaction }
        );
        await initiateRefund(
          order,
          webhookData.payment.cf_payment_id,
          webhookData.order.order_amount,
          transaction
        );
        await transaction.commit();
        console.error(`Error proccessing webhook:- Insufficient stock: only ${inventory.quantity} item(s) available`)
      }

      // Deduct stock
      await inventory.decrement(
        {
          quantity: Number(order.quantity),
          reservedQuantity: Number(order.quantity),
        },
        { transaction }
      );
      
      console.log("Inventory" , inventory)

      // Create shipment
      // const shippingData = await createShipment(order, product, shippingDetails);

      // Update order with shipping details
      await order.update(
        {
          status: "shipped",
          shiprocketOrderId: "shippingData.shiprocketOrderId",
          awbNumber: "shippingData.awbNumber",
          trackingLink: "shippingData.trackingLink",
          paymentDetails: {
            ...order.paymentDetails,
            order_status: webhookData.payment.payment_statuss,
            payment_time: webhookData.payment.payment_time,
            payment:{
              ...webhookData.payment
            },
            customer_details: {
              ...webhookData.customer_details
            },
            payment_gateway_details: {
              ...webhookData.payment_gateway_details
            }
          },
        },
        { transaction }
      );
    } else {
      // Digital products
      await order.update(
        {
          status: "delivered",
          paymentDetails: {
            ...order.paymentDetails,
            order_status: webhookData.payment.payment_status,
            payment_time: webhookData.payment.payment_time,
            payment:{
              ...webhookData.payment
            },
            customer_details: {
              ...webhookData.customer_details
            },
            payment_gateway_details: {
              ...webhookData.payment_gateway_details
            }
          },
        },
        { transaction }
      );
    }

    // Create transaction record
    await Transaction.create(
      {
        orderId: order.id,
        amount: webhookData.order.order_amount,
        currency: webhookData.order.order_currency,
        method: webhookData.payment.payment_method || "unknown",
        status: "successful",
        paymentDetails: {
          payment_id: webhookData.payment.cf_payment_id,
          payment_method: webhookData.payment.payment_method,
          payment_time: webhookData.payment.payment_time,
          order_id: webhookData.order.order_id,
          cf_order_id: webhookData.order?.cf_order_id,
          entity: webhookData.payment?.entity,
        },
      },
      { transaction }
    );

    console.log("order data" , order)
    console.log("Transaction" , transaction)


    await transaction.commit();
    console.log(`Payment successful, stock updated, and processed for order ${order.id}`);
  } catch (error) {
    await transaction.rollback();
    console.error("Error handling successful payment:", error);
    throw error;
  }
};

/**
 * Handle failed payment
 */
const handlePaymentFailed = async (order, webhookData) => {
  const transaction = await db.sequelize.transaction();

  try {
    await order.update(
      {
        status: "failed",
        paymentDetails: {
          ...order.paymentDetails,
          order_status: webhookData.payment.payment_status,
          failure_reason:
            webhookData.error_details?.error_description || "Payment failed",
          payment:{
            ...webhookData.payment
          },
          customer_details: {
            ...webhookData.customer_details
          },
          payment_gateway_details: {
            ...webhookData.payment_gateway_details
          },
          error_details: {
            ...webhookData.error_details
          }
        },
      },
      { transaction }
    );

    await Transaction.create(
      {
        orderId: order.id,
        amount: webhookData.order.order_amount,
        currency: webhookData.order.order_currency,
        method: webhookData.payment.payment_method || "unknown",
        status: "failed",
        paymentDetails: {
          payment_id: webhookData.payment.cf_payment_id,
          payment_method: webhookData.payment.payment_method,
          order_id: webhookData.order.order_id,
          cf_order_id: webhookData.order?.cf_order_id,
          entity: webhookData.payment?.entity,
          failure_reason:
            webhookData.payment.error_details?.error_description || "Payment failed",
        },
      },
      { transaction }
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error("Error handling failed payment:", error);
    throw error;
  }
};

/**
 * Handle payment dropped
 */
const handlePaymentDropped = async (order, webhookData) => {
  const transaction = await db.sequelize.transaction();

  try {
    await order.update(
      {
        status: "failed",
        paymentDetails: {
          ...order.paymentDetails,
          order_status: webhookData.payment.payment_status,
          failure_reason: "Payment dropped by user",
          payment:{
            ...webhookData.payment
          },
          customer_details: {
            ...webhookData.customer_details
          },
          payment_gateway_details: {
            ...webhookData.payment_gateway_details
          },
        },
      },
      { transaction }
    );

    await Transaction.create(
      {
        orderId: order.id,
        amount: webhookData.order.order_amount,
        currency: webhookData.order.order_currency,
        method: webhookData.payment.payment_method || "unknown",
        status: "failed",
        paymentDetails: {
          payment_id: webhookData.payment.cf_payment_id,
          payment_method: webhookData.payment.payment_method,
          order_id: webhookData.order.order_id,
          cf_order_id: webhookData.order?.cf_order_id,
          entity: webhookData.payment?.entity,
          failure_reason: "Payment dropped by user",
        },
      },
      { transaction }
    );

    await transaction.commit();
    console.log(`Payment dropped for order ${order.id}`);
  } catch (error) {
    await transaction.rollback();
    console.error("Error handling dropped payment:", error);
    throw error;
  }
};

module.exports = { cashfreeWebhook };