const db = require("../../dbConfig/dbConfig.js");
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");
const Order = db.saasOrder;
const dotenv = require('dotenv').config();
const { CASHFREE_XClientId, CASHFREE_XClientSecret, CASHFREE_API_Version, API_URL } = process.env;
const axios = require("axios");


// createOrder
const createOrder = asyncHandler(async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { subscription } = req.body
        const userId = req.user.id;
        if (!userId) {
            return next(new ErrorHandler("userId is missing", 400));
        }
        if (!subscription) {
            return next(new ErrorHandler("subscription Detail is missing", 400));
        }
        const order = await Order.create({
            customerId: userId,
            date: new Date(),
            subscription: subscription,
            status: "pending",
            userId: userId,
        }, { transaction });
        console.log("Order created successfully:", order);
        await transaction.commit();
        return res.status(200).send({ status: true, data: order });
    } catch (error) {
        await transaction.rollback();
        console.error("Error creating order:", error);
        return next(new ErrorHandler(error.message, 500));
    }
});

const createCashfreeCheckout = asyncHandler(async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { orderId, planPrice,currency,returnUrl } = req.body;
        const userId = req.user.id;

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

        // Get user details
        const user = await db.users.findOne({
            where: { id: userId },
            transaction,
        });

        if (!user) {
            await transaction.rollback();
            return next(new ErrorHandler("User not found", 404));
        }

        // Prepare notification URL
        const notifyUrl =
            process.env.NOTIFICATION_URL ||
            "https://xplr.live/api/v1/subscription/cashfree/webhook";

        // Prepare return URL
        const redirectUrl = returnUrl || "https://xplr.live/payment/status";

        // Create Cashfree payment session
        const apiUrl =
            process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg/orders";
        const apiVersion = process.env.CASHFREE_API_Version || "2022-09-01";

        const paymentData = {
            order_id: orderId,
            order_amount: planPrice,
            order_currency: currency || "INR",
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
                "x-api-version": CASHFREE_API_Version,
                "x-client-id": CASHFREE_XClientId,
                "x-client-secret": CASHFREE_XClientSecret,
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
                payment: {
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
                payment_url: `${process.env.CASHFREE_CHECKOUT_URL ||
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

const getOrderStatus = asyncHandler(async (req, res, next) => {
    try {
      const { order_id } = req.query;
  
      if (!order_id) {
        return next(new ErrorHandler("Order ID is required", 400));
      }
  
      // Find the order with associated data
      const order = await Order.findOne({
        where: { id: order_id }
      });
  
      if (!order) {
        return next(new ErrorHandler("Order not found", 404));
      }
  
    //   console.log("i am coming from line 362", order);
  
      // Verify order token if provided
    //   if (
    //     order_token &&
    //     order.paymentDetails &&
    //     order.paymentDetails.order_token !== order_token
    //   ) {
    //     return next(new ErrorHandler("Invalid order token", 401));
    //   }
  
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
          payment_details: order.payment,
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
const updateOrderStatusAndCreateTransaction = asyncHandler(async (data, next) => {
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

module.exports = {
    createOrder,
    createCashfreeCheckout,
    getOrderStatus,
};