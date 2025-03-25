const db = require("../../dbConfig/dbConfig.js");
const Order = db.order;
const Campaign = db.campaigns;
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");

const createOrder = asyncHandler(async (req, res, next) => {
  const transaction = await db.sequelize.transaction();

    const { productDetails, campaignId } = req.body;
    const userId = req.endUser.id;
    console.log(userId);
    
    // Validate required parameters
    if (!productDetails) {
      await transaction.rollback();
      return next(new ErrorHandler("Product Details is missing", 400));
    }
    
    if (!campaignId) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign ID is required", 400));
    }
    
    // Further validate product details
    if (!productDetails.price || !productDetails.name || !productDetails.currency) {
      await transaction.rollback();
      return next(new ErrorHandler("Product details must include price , name and currency", 400));
    }
    
    // Check if price is valid
    if (typeof productDetails.price !== "number" || productDetails.price <= 0) {
      await transaction.rollback();
      return next(new ErrorHandler("Product price must be a positive number", 400));
    }
    try {
    // Check if the campaign exists
    const campaign = await Campaign.findOne({
      where: {
        campaignID: campaignId,
      },
      transaction,
    });

    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found", 404));
    }
    
    // Create the order
    const order = await Order.create(
      {
        providerUserId: userId,
        date: new Date(),
        productDetails: JSON.stringify(productDetails),
        paymentDetails: {},
        status: "pending",
        campaignId: campaignId,
        userId:userId
      },
      { transaction }
    );
     
    console.log("Order created successfully:", order.id);
    await transaction.commit();
    
    return res.status(200).json({ 
      success: true, 
      message: "Order created successfully. Proceed to create checkout.",
      data: order,
    });
  } catch (error) {
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

/**
 * Get order details by ID
 */
const getOrderById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return next(new ErrorHandler("Order ID is required", 400));
    }
    
    const order = await Order.findOne({
      where: { id },
      include: [
        {
          model: Campaign,
          as: "campaign",
          attributes: ["campaignID", "name"]
        }
      ]
    });
    
    if (!order) {
      return next(new ErrorHandler("Order not found", 404));
    }
    
    // Check if user is authorized to access this order
    if (req.endUser && req.endUser.id !== order.providerUserId) {
      return next(new ErrorHandler("Not authorized to access this order", 403));
    }
    
    return res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    return next(new ErrorHandler("Error fetching order details", 500));
  }
});

/**
 * Get all orders for a user
 */
const getUserOrders = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.endUser.id;
    
    const orders = await Order.findAll({
      where: { providerUserId: userId },
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Campaign,
          as: "campaign",
          attributes: ["campaignID", "name"]
        }
      ]
    });
    
    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    return next(new ErrorHandler("Error fetching user orders", 500));
  }
});

module.exports = {
  createOrder,
  getOrderById,
  getUserOrders
};