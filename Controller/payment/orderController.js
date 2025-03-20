const db = require("../../dbConfig/dbConfig.js");
const Order = db.order;
const Campaign = db.campaigns;
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");

//------create order---------------------------------------
const createOrder = asyncHandler(async(req,res) => {
    const transaction = await db.sequelize.transaction();
    try {
      const {productDetails,paymentDetails,campaignId}=req.body
      const userId=req.endUser.id
      if(!userId){
        return res.status(400).send({status:false,message:"Unauthorized access"});
      }
      if(!productDetails){
        return res.status(400).send({status:false,message:"Product Details is missing"});
      }
      const order = await Order.create({
        providerUserId: userId,
        date: new Date(),
        productDetails: productDetails,
        paymentDetails:paymentDetails,
        status: "pending",
      },{ transaction });
      console.log("Order created successfully:", order);
      await transaction.commit();
      return res.status(200).send({status:true,data:order});
    } catch (error) {
      await transaction.rollback();
      console.error("Error creating order:", error);
      return res.status(500).send({status:false,message:error.message||"Error creating order"})
    }
  });
// const createOrder = async (customer, data) => {
//   const transaction = await db.sequelize.transaction();
//   try {
//     const order = await Order.create({
//       customerId: customer.metadata.userId,
//       StripeCustomerId: data.customer,
//       date: new Date(),
//       invoiceNumber: data.invoice,
//       subscription: data.metadata,
//       payment: {
//         intentId: data.payment_intent,
//         status: data.payment_status,
//         amount: data.amount_total / 100,
//         currency: data.currency,
//         method: data.payment_method_types[0],
//       },
//       status: data.status,
//     },{ transaction });
//     console.log("Order created successfully:", order);
//     await transaction.commit();
//     return order;
//   } catch (error) {
//     await transaction.rollback();
//     console.error("Error creating order:", error);
//     throw new Error("Error creating order");
//   }
// };

// const orderDetails = async (req, res) => {
//   let { session_id } = req.query;
//   console.log(session_id);
//   try {
//     const session = await stripe.checkout.sessions.retrieve(session_id);
// console.log("session hu order file se", session);
//     const transaction = await db.sequelize.transaction();
//     try {
//       const order = await Order.create({
//         customerId: session.metadata.userId,
//         StripeCustomerId: session.id,
//         date: new Date(),
//         invoiceNumber: session.invoice, // Assuming invoice is in metadata
//         subscription: session.metadata,
//         payment: {
//           intentId: session.payment_intent,
//           status: session.payment_status,
//           amount: session.amount_total / 100,
//           currency: session.currency,
//           method: session.payment_method_types[0],
//         },
//         status: session.status,
//       }, { transaction });
//       console.log("Order created successfully:", order);
//       await transaction.commit();
//       res.json(order);
//     } catch (error) {
//       await transaction.rollback();
//       console.error("Error creating order:", error);
//       res.status(500).json({ error: "Error creating order" });
//     }
//   } catch (err) {
//     console.log("Something went wrong", err.message);
//     res.status(500).json({ error: "Failed to retrieve session" });
//   }
// };

module.exports = {
  // orderDetails,
  createOrder
};

// const createOrder = asyncHandler(async (customer, data) => {
//   const transaction = await db.sequelize.transaction();

//   try {
//     const order = await Order.create({
//       userId: customer.metadata.userId,
//       StripeCustomerId: data.customer,
//       date: new Date(),
//       invoiceNumber: data.invoice,
//       subscription: data.metadata,
//       payment: {
//         intentId: data.payment_intent,
//         status: data.payment_status,
//         amount: data.amount_total / 100,
//         currency: data.currency,
//         method: data.payment_method_types[0],
//       },
//       status: 'pending',
//     }, { transaction });

//     console.log('Order created successfully:', order);

//     if (data.payment_status === 'paid') {
//       await handleSuccessfulPayment(order, customer, data, transaction);
//     } else if (data.payment_status === 'failed') {
//       await handleFailedPayment(order, customer, data, transaction);
//     } else if (data.payment_status === 'pending') {
//       await handlePendingPayment(order, customer, data, transaction);
//     }

//     await transaction.commit();
//     return order;
//   } catch (error) {
//     await transaction.rollback();
//     console.error('Error creating order:', error);
//     throw new Error('Error creating order');
//   }
// });

// const handleSuccessfulPayment = async (order, customer, data, transaction) => {
//   try {
//     order.status = 'paid';
//     await order.save({ transaction });

//     const startDate = new Date();
//     const duration = data.metadata.duration; // Ensure duration is provided in metadata
//     const endDate = calculateEndDate(startDate, duration);

//     const subscription = await Subscription.create({
//       userId: customer.metadata.userId,
//       planId: data.metadata.planId,
//       status: 'active',
//       startDate,
//       endDate,
//       duration,
//     }, { transaction });

//     console.log('Payment succeeded and subscription created or updated:', subscription);
//   } catch (error) {
//     console.error('Error handling successful payment:', error);
//     throw error;
//   }
// };

// const handleFailedPayment = async (order, customer, data, transaction) => {
//   try {
//     order.status = 'failed';
//     await order.save({ transaction });

//     console.log('Payment failed for order:', order);
//   } catch (error) {
//     console.error('Error handling failed payment:', error);
//     throw error;
//   }
// };

// const handlePendingPayment = async (order, customer, data, transaction) => {
//   try {
//     console.log('Payment pending for order:', order);
//   } catch (error) {
//     console.error('Error handling pending payment:', error);
//     throw error;
//   }
// };