const db = require("../../../dbConfig/dbConfig.js");
const Order = db.order;
const Campaign = db.campaigns;
const endUser = db.endUsers;
const CashfreeConfig = db.cashfreeConfig;
const ErrorHandler = require("../../../utils/ErrorHandler.js");
const asyncHandler = require("../../../utils/asyncHandler.js");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

/**
 * Create a new Cashfree checkout session
 * @route POST /api/v1/payment/cashfree/checkout
 */
const createCashfreeCheckout = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { orderId, returnUrl } = req.body;
    const userId = req.endUser.id;

    // Validate required parameters
    if (!orderId || !returnUrl) {
      await transaction.rollback();
      return next(new ErrorHandler("Missing required fields", 400));
    }

    const order = await Order.findOne({
      where: { id: orderId },
      transaction,
    });

    if (!order) {
      await transaction.rollback();
      return next(new ErrorHandler("Order not found", 404));
    }
    // return console.log(order);
    const productDetails = JSON.parse(order.productDetails);
    const campaignId=order.campaignId
    console.log("line 38",productDetails);
    // Validate product details
    if (!productDetails.price || !productDetails.name) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Product details must include price and name", 400)
      );
    }

    // Check if price is valid
    if (typeof productDetails.price !== "number" || productDetails.price <= 0) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Product price must be a positive number", 400)
      );
    }

    // Find the campaign
    const campaign = await Campaign.findOne({
      where: { campaignID: campaignId },
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
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found", 404));
    }

    // Check if campaign has Cashfree configuration
    if (!campaign.payment || campaign.payment.length === 0) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Campaign does not have Cashfree configuration", 400)
      );
    }

    // Get Cashfree configuration
    const cashfreeConfig = campaign.payment[0];

    // Get user details
    const user = await endUser.findOne({
      where: { id: userId },
      transaction,
    });

    if (!user) {
      await transaction.rollback();
      return next(new ErrorHandler("User not found", 404));
    }

    // // Generate order ID if not provided
    // const finalOrderId = orderId;

    // // Create order in database or find existing if orderId was provided
    // let order;
    // if (orderId) {

    //     // Create a new order with the provided ID
    //     order = await Order.create(
    //       {
    //         id: finalOrderId,
    //         providerUserId: userId,
    //         date: new Date(),
    //         productDetails: JSON.stringify(productDetails),
    //         paymentDetails: {},
    //         status: "pending",
    //         campaignId: campaignId,
    //       },
    //       { transaction }
    //     );
    //   }
    // } else {
    //   // Create a new order with generated ID
    //   order = await Order.create(
    //     {
    //       id: finalOrderId,
    //       providerUserId: userId,
    //       date: new Date(),
    //       productDetails: JSON.stringify(productDetails),
    //       paymentDetails: {},
    //       status: "pending",
    //       campaignId: campaignId,
    //     },
    //     { transaction }
    //   );
    // }

    // Prepare notification URL
    const notifyUrl =
      process.env.NOTIFICATION_URL ||
      "https://xplr.live/api/v1/payment/cashfree/webhook";

    // Prepare return URL
    const redirectUrl =
    returnUrl || "https://xplr.live/payment/status";

    // Create Cashfree payment session
    const apiUrl =
      process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg/orders";
    const apiVersion = process.env.CASHFREE_API_VERSION || "2022-09-01";

    const paymentData = {
      order_id: orderId,
      order_amount: productDetails.price,
      order_currency: productDetails.currency || "INR",
      customer_details: {
        customer_id: userId,
        customer_phone: user.countryCode
          ? `${user.countryCode}${user.phone}`
          : user.phone,
        customer_email: user.email || null,
        customer_name: user.name || null,
      },
      order_meta: {
        // return_url: `${redirectUrl}?order_id={order_id}&order_token={order_token}`,
        notify_url: notifyUrl,
        payment_methods: "cc,dc,ppc,ccc,emi,paypal,upi,nb,app,paylater",
      },
    };

    const response = await axios({
      method: "POST",
      url: apiUrl,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-version": apiVersion,
        "x-client-id": cashfreeConfig.XClientId,
        "x-client-secret": cashfreeConfig.XClientSecret,
      },
      data: paymentData,
    });

    if (!response.data || !response.data.payment_session_id) {
      await transaction.rollback();
      return next(
        new ErrorHandler("Failed to create Cashfree payment session", 500)
      );
    }

    // // Update order with payment session ID
    await order.update(
      {
        paymentDetails: {
          payment_session_id: response.data.payment_session_id,
          cf_order_id: response.data.cf_order_id,
          order_status: response.data.order_status,
          order_token: response.data.order_token,
        },
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      data: {
        order_id: orderId,
        payment_session_id: response.data.payment_session_id,
        payment_url: `${
          process.env.CASHFREE_CHECKOUT_URL ||
          "https://sandbox.cashfree.com/pg/view"
        }/${response.data.payment_session_id}`,
        order_token: response.data.order_token,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error(
      "Cashfree checkout error:",
      error.response ? error.response.data : error.message
    );
    return next(
      new ErrorHandler(
        error.response ? error.response.data.message : error.message,
        500
      )
    );
  }
});

/**
 * Get payment status by order ID
 * @route GET /api/v1/payment/cashfree/status/:orderId
 */
const getPaymentStatus = asyncHandler(async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return next(new ErrorHandler("Order ID is required", 400));
    }

    // Find the order
    const order = await Order.findOne({
      where: { id: orderId },
      include: [
        {
          model: Campaign,
          as: "campaign",
          include: [
            {
              model: CashfreeConfig,
              as: "payment",
              attributes: ["id", "XClientId", "XClientSecret"],
            },
          ],
        },
      ],
    });

    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }

    // Check if campaign has Cashfree configuration
    if (
      !order.campaign ||
      !order.campaign.payment ||
      order.campaign.payment.length === 0
    ) {
      return next(
        new ErrorHandler("Campaign payment configuration not found", 404)
      );
    }

    // Get Cashfree configuration
    const cashfreeConfig = order.campaign.payment[0];

    // Get payment status from Cashfree
    const apiUrl =
      process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg/orders";
    const apiVersion = process.env.CASHFREE_API_VERSION || "2022-09-01";

    const response = await axios({
      method: "GET",
      url: `${apiUrl}/${orderId}`,
      headers: {
        Accept: "application/json",
        "x-api-version": apiVersion,
        "x-client-id": cashfreeConfig.XClientId,
        "x-client-secret": cashfreeConfig.XClientSecret,
      },
    });

    if (!response.data) {
      return next(new ErrorHandler("Failed to get payment status", 500));
    }

    // Update order status if payment is completed
    if (response.data.order_status === "PAID" && order.status !== "paid") {
      await order.update({
        status: "paid",
        paymentDetails: {
          ...order.paymentDetails,
          order_status: response.data.order_status,
          payment_time: new Date().toISOString(),
        },
      });
    } else if (
      response.data.order_status === "EXPIRED" ||
      response.data.order_status === "CANCELLED"
    ) {
      await order.update({
        status: "failed",
        paymentDetails: {
          ...order.paymentDetails,
          order_status: response.data.order_status,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        order_id: orderId,
        order_status: response.data.order_status,
        order_token:response.data.order_token,
        order_amount: response.data.order_amount,
        payment_details: response.data.payments || [],
      },
    });
  } catch (error) {
    console.error(
      "Payment status error:",
      error.response ? error.response.data : error.message
    );
    return next(
      new ErrorHandler(
        error.response ? error.response.data.message : error.message,
        500
      )
    );
  }
});

/**
 * Get order status from the client side after payment redirect
 * @route GET /api/v1/payment/cashfree/order-status
 */
const getOrderStatus = asyncHandler(async (req, res, next) => {
  try {
    const { order_id, order_token } = req.query;

    if (!order_id) {
      return next(new ErrorHandler("Order ID is required", 400));
    }

    // Find the order
    const order = await Order.findOne({
      where: { id: order_id },
    });

    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }

    // Verify order token if provided
    if (
      order_token &&
      order.paymentDetails &&
      order.paymentDetails.order_token !== order_token
    ) {
      return next(new ErrorHandler("Invalid order token", 401));
    }

    // Get the latest transaction for this order
    const transaction = await db.transaction.findOne({
      where: { orderId: order_id },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: {
        order_id: order.id,
        order_status: order.status,
        payment_status:
          order.paymentDetails && order.paymentDetails.order_status,
        transaction: transaction
          ? {
              status: transaction.status,
              amount: transaction.amount,
              method: transaction.method,
              date: transaction.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Order status error:", error);
    return next(new ErrorHandler(error.message, 500));
  }
});

/**
 * Cancel a pending payment
 * @route POST /api/v1/payment/cashfree/cancel
 */
const cancelPayment = asyncHandler(async (req, res, next) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return next(new ErrorHandler("Order ID is required", 400));
    }

    // Find the order
    const order = await Order.findOne({
      where: { id: orderId },
      include: [
        {
          model: Campaign,
          as: "campaign",
          include: [
            {
              model: CashfreeConfig,
              as: "payment",
              attributes: ["id", "XClientId", "XClientSecret"],
            },
          ],
        },
      ],
    });

    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }

    // Only pending orders can be cancelled
    if (order.status !== "pending") {
      return next(
        new ErrorHandler("Only pending orders can be cancelled", 400)
      );
    }

    // Check if campaign has Cashfree configuration
    if (
      !order.campaign ||
      !order.campaign.payment ||
      order.campaign.payment.length === 0
    ) {
      return next(
        new ErrorHandler("Campaign payment configuration not found", 404)
      );
    }

    // Get Cashfree configuration
    const cashfreeConfig = order.campaign.payment[0];

    // Cancel order in Cashfree
    const apiUrl =
      process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg/orders";
    const apiVersion = process.env.CASHFREE_API_VERSION || "2022-09-01";

    await axios({
      method: "PATCH",
      url: `${apiUrl}/${orderId}`,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-version": apiVersion,
        "x-client-id": cashfreeConfig.XClientId,
        "x-client-secret": cashfreeConfig.XClientSecret,
      },
      data: {
        order_status: "TERMINATED",
      },
    });

    // Update order status
    await order.update({
      status: "failed",
      paymentDetails: {
        ...order.paymentDetails,
        order_status: "CANCELLED",
        cancelled_at: new Date().toISOString(),
        cancelled_by: req.endUser ? req.endUser.id : "system",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Payment cancelled successfully",
      data: {
        order_id: orderId,
        status: "CANCELLED",
      },
    });
  } catch (error) {
    console.error(
      "Cancel payment error:",
      error.response ? error.response.data : error.message
    );
    return next(
      new ErrorHandler(
        error.response ? error.response.data.message : error.message,
        500
      )
    );
  }
});

module.exports = {
  createCashfreeCheckout,
  getPaymentStatus,
  getOrderStatus,
  cancelPayment,
};
