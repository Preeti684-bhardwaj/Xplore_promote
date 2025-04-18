const db = require("../../dbConfig/dbConfig.js");
const { validationResult } = require("express-validator")
const { fetchShippingRates  } = require("../../utils/shipRocket.js")
const axios = require("axios")
const { validateAndApplyCoupon } = require("../../utils/coupon.js")
const Order = db.order;
const Campaign = db.campaigns;
const Product = db.Product;
const Category = db.Collection
const Inventory = db.Inventory;
const InventoryLocation = db.InventoryLocation;
const ProductVariant = db.ProductVariant;
const CashfreeConfig = db.cashfreeConfig
const ShippingDetail = db.ShippingDetail
const endUsers = db.endUsers
const { Op  } = require("sequelize")
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");

// Utility to convert weight to kg
const convertToKg = (weight, unit) => {
  switch (unit) {
    case 'g': return weight / 1000;
    case 'oz': return weight * 0.02835;
    case 'lb': return weight * 0.453592;
    case 'kg': return weight;
    default: return weight;
  }
};

const buyNow = asyncHandler(async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ErrorHandler(errors.array()[0].msg, 400));
    }

    const { productId, variantId, quantity, campaignId } = req.body;

    if (!productId || !variantId || !quantity || !campaignId) {
      return next(new ErrorHandler("Product ID, Variant ID, Campaign ID, and Quantity are required", 400));
    }

    if (quantity <= 0) {
      return next(new ErrorHandler("Quantity must be greater than zero", 400));
    }

    const campaign = await Campaign.findOne({ where: { campaignID: campaignId } });
    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    const product = await Product.findByPk(productId, {
      include: [{
        model: ProductVariant,
        where: { id: variantId },
        required: true,
        include: [{
          model: Inventory,
          include: [InventoryLocation]
        }]
      }]
    });

    if (!product) {
      return next(new ErrorHandler("Product or variant not found", 404));
    }

    const variant = product.ProductVariants[0];

    if (product.type === 'physical') {
      const totalAvailableStock = variant.Inventories.reduce(
        (sum, inv) => sum + Number(inv.quantity - inv.reservedQuantity),
        0
      );

      if(totalAvailableStock == 0){
        return next(new ErrorHandler('No stock available' , 400))
      }

      if (totalAvailableStock < quantity) {
        return next(new ErrorHandler(
          `Only ${totalAvailableStock} unit(s) available in stock. Please reduce your quantity`,
          400
        ));
      }

      const eligibleInventories = variant.Inventories.filter(
        inv => (inv.quantity - inv.reservedQuantity) >= quantity
      );
      if (eligibleInventories.length === 0) {
        return next(new ErrorHandler(
          `No single inventory location has ${quantity} unit(s) available`,
          400
        ));
      }
    } else if (product.type === 'digital') {
      // Assume digital products have no stock limit unless specified Add checks here if digital products have license limits
    } else {
      return next(new ErrorHandler("Unsupported product type", 400));
    }

    return res.json({
      success: true,
      message: "Product quantity is available for purchase",
      data: {
        productId,
        variantId,
        quantity,
        productType: product.type
      }
    });

  } catch (error) {
    console.error("Error in buyNow:", error);
    return next(error instanceof ErrorHandler ? error : new ErrorHandler(error.message || "Unexpected error in buyNow", 500));
  }
});

const orderSummery = asyncHandler(async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ErrorHandler(errors.array()[0].msg, 400));
    }

    const { productId, variantId, quantity, shippingPincode, couponCode, campaignId } = req.body;

    if (!productId || !variantId || !quantity || !campaignId) {
      return next(new ErrorHandler("Product ID, Variant ID, Quantity, and Campaign ID are required", 400));
    }

    if (quantity <= 0) {
      return next(new ErrorHandler("Quantity must be greater than zero", 400));
    }

    const campaign = await Campaign.findOne({ where: { campaignID: campaignId } });
    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    const product = await Product.findByPk(productId, {
      include: [
        {
          model: ProductVariant,
          where: { id: variantId },
          required: true,
          include: [{
            model: Inventory,
            include: [InventoryLocation],
          }],
        },
        {
          model: Category,
          attributes: ['id', 'name', "user_id"]
        }
      ]
    });

    if (!product) {
      return next(new ErrorHandler("Product or variant not found", 404));
    }

    const variant = product.ProductVariants[0];
    const isShippingRequired = product.type === 'physical';

    if (isShippingRequired && !shippingPincode) {
      return next(new ErrorHandler("Shipping pincode is required for physical products", 400));
    }

    if (product.type === 'physical') {
      const totalAvailableStock = variant.Inventories.reduce(
        (sum, inv) => sum + (inv.quantity - inv.reservedQuantity),
        0
      );

      if(totalAvailableStock == 0){
        return next(new ErrorHandler('No stock available' , 400))
      }

      if (totalAvailableStock < quantity) {
        return next(new ErrorHandler(
          `Only ${totalAvailableStock} item(s) available in stock`,
          400
        ));
      }

      const eligibleInventories = variant.Inventories.filter(
        inv => (inv.quantity - inv.reservedQuantity) >= quantity
      );

      if (eligibleInventories.length === 0) {
        return next(new ErrorHandler(
          `No single inventory location has ${quantity} item(s) available`,
          400
        ));
      }
    } else if (product.type !== 'digital') {
      return next(new ErrorHandler("Unsupported product type", 400));
    }

    let price = parseFloat(variant.price);
    let subtotal = (price * quantity).toFixed(2);
    let shippingCharge = 0;
    let pickupPincode = null;

    if (isShippingRequired) {
      const eligibleInventories = variant.Inventories.filter(
        inv => (inv.quantity - inv.reservedQuantity) >= quantity
      );
      const pickupLocation = eligibleInventories.find(
        inv => inv.InventoryLocation?.pincode === shippingPincode
      ) || eligibleInventories[0];

      if (!pickupLocation) {
        return next(new ErrorHandler("No eligible pickup location found", 400));
      }

      if (!pickupLocation.InventoryLocation) {
        return next(new ErrorHandler("Selected inventory lacks location details", 400));
      }

      pickupPincode = pickupLocation.InventoryLocation.pincode;
      // const weightInKg = convertToKg(parseFloat(variant.weight), variant.weight_unit);
      // const totalWeight = weightInKg * quantity;

      try {
        // const { rate } = await fetchShippingRates(
        //   shippingPincode,
        //   totalWeight,
        //   pickupPincode
        // );
        // shippingCharge = rate;
      } catch (error) {
        console.error("Error fetching shipping rates:", error);
        return next(new ErrorHandler("Failed to calculate shipping charge", 500));
      }
    }

    let discount = 0;
    let appliedCouponCode = null;

    if (couponCode) {
      try {
        const { discount: discountApply, coupon } = await validateAndApplyCoupon(
          req.endUser.id,
          product,
          quantity,
          couponCode
        );
        discount = discountApply;
        appliedCouponCode = couponCode;
      } catch (error) {
        return next(new ErrorHandler(error.message || "Invalid coupon code", 400));
      }
    }

    const total = parseFloat(subtotal + shippingCharge - discount )
    const formattedSubtotal = parseFloat(total.toFixed(2));

    if (total < 0) {
      return next(new ErrorHandler("Total amount cannot be negative", 400));
    }

    return res.status(200).json({
      success: true,
      data: {
        subtotal:Number(subtotal),
        shippingCharge,
        discount,
        total:formattedSubtotal,
        appliedCouponCode,
        productType: product.type,
        pickupPincode
      }
    });

  } catch (error) {
    console.error("Error in orderSummery:", error);
    return next(error instanceof ErrorHandler ? error : new ErrorHandler(error.message || "Unexpected error in orderSummery", 500));
  }
});

const createOrder = asyncHandler(async (req, res, next) => {
  const {
    productId,
    variantId,
    quantity,
    shippingAddress,
    couponCode,
    campaignId,
    returnUrl,
    paymentMethod = 'cashfree',
    total:frontendTotal, // New: Total from frontend
    shippingCharge:frontendShippingCharge, // New: Shipping charge from frontend
    discount:frontendDiscount, // New: Discount from frontend
  } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ErrorHandler(errors.array()[0].msg , 400))
  }

  const { name, address, city, pincode: shippingPincode, country, phone } = shippingAddress || {};
  const endUserId = req.endUser.id;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Validate campaign
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

    // 2. Validate product + variant
    const product = await Product.findByPk(productId, {
      include: [
        {
          model: ProductVariant,
          where: { id: variantId },
          required: true,
          include: [{ model: Inventory, include: [InventoryLocation] }],
        },
        {
          model: Category,
          attributes: ['id', 'name']
        }
      ],
      transaction,
    });
    if (!product) {
      await transaction.rollback();
      return next(new ErrorHandler('Product or variant not found', 404));
    }

    const variant = product.ProductVariants[0];
  
    // 3. Pricing and shipping logic
    const price = parseFloat(variant.price);
    const subtotal = price * quantity;
    const isShippingRequired = product.type === 'physical';

    let backendShippingCharge = 0;
    let pickupLocation = null;
    let reservationExpiry = null

    if (isShippingRequired) {
      if (!shippingAddress || !name || !address || !city || !shippingPincode || !country || !phone) {
        await transaction.rollback();
        return next(new ErrorHandler("Shipping address details are required for physical products", 400));
      }

      const availableStock = variant.Inventories.reduce((sum, inv) => sum + (inv.quantity - inv.reservedQuantity), 0);

      if(availableStock == 0){
        return next(new ErrorHandler('No stock available' , 400))
      }

      if (availableStock < quantity) {
        await transaction.rollback();
        return next(new ErrorHandler(`Only ${availableStock} item(s) available in stock`, 400));
      }

      const eligibleInventories = variant.Inventories.filter(inv => (inv.quantity - inv.reservedQuantity ) >= quantity);

      if (!eligibleInventories.length) {
        throw new ErrorHandler(`No inventory available to reserve ${quantity} item(s)`, 400);
      }

      pickupLocation =
        eligibleInventories.find(inv => inv.InventoryLocation?.pincode === shippingPincode) ||
        eligibleInventories[0];

      if (!pickupLocation) {
        await transaction.rollback();
        return next(new ErrorHandler("No eligible pickup location found", 400));
      }

      await pickupLocation.increment(
        { reservedQuantity: Number(quantity) },
        { transaction }
      );

      reservationExpiry = new Date(Date.now() + 60 * 60 * 1000);


      // const weightInKg = convertToKg(parseFloat(variant.weight), variant.weight_unit);
      // const totalWeight = weightInKg * quantity;
      // const { rate } = await fetchShippingRates(
      //   shippingPincode,
      //   totalWeight,
      //   pickupLocation.InventoryLocation.pincode
      // );
      // backendShippingCharge = rate;
    }

    // 4. Handle coupons
    let backendDiscount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      const { discount, coupon } = await validateAndApplyCoupon(
        req.endUser.id,
        product,
        quantity,
        couponCode
      );
      backendDiscount = discount;
      appliedCoupon = coupon;
    }

    const backendTotal = subtotal + backendShippingCharge - backendDiscount;

    // Ensure frontend values are numbers and non-negative
    if (frontendTotal != null && (isNaN(frontendTotal) || frontendTotal < 0)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid frontend total", 400));
    }
    if (frontendShippingCharge != null && (isNaN(frontendShippingCharge) || frontendShippingCharge < 0)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid frontend shipping charge", 400));
    }
    if (frontendDiscount != null && (isNaN(frontendDiscount) || frontendDiscount < 0)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid frontend discount", 400));
    }

    // Compare frontend and backend values (allow small floating-point differences, e.g., 0.01)
    const epsilon = 0.01;
    if (frontendTotal != null && Math.abs(frontendTotal - backendTotal) > epsilon) {
      await transaction.rollback();
      return next(new ErrorHandler(`Frontend total (${frontendTotal}) does not match backend total (${backendTotal})`, 400));
    }
    if (frontendShippingCharge != null && Math.abs(frontendShippingCharge - backendShippingCharge) > epsilon) {
      await transaction.rollback();
      return next(new ErrorHandler(`Frontend shipping charge (${frontendShippingCharge}) does not match backend shipping charge (${backendShippingCharge})`, 400));
    }
    if (frontendDiscount != null && Math.abs(frontendDiscount - backendDiscount) > epsilon) {
      await transaction.rollback();
      return next(new ErrorHandler(`Frontend discount (${frontendDiscount}) does not match backend discount (${backendDiscount})`, 400));
    }

    // 6. Create order
    const order = await Order.create({
      userId: endUserId,
      providerUserId: endUserId,
      date: new Date(),
      productId: product.id,
      variantId: variantId,
      paymentDetails: {},
      productType: product.type,
      quantity,
      finalAmount: backendTotal,
      subtotal,
      shippingCharges: backendShippingCharge,
      discountAmount: backendDiscount,
      status: "pending",
      campaignId,
      couponId: appliedCoupon ? appliedCoupon.id : null,
      reservationExpiry,
      inventoryId: pickupLocation ? pickupLocation.id : null,
    }, { transaction });

    // 7. Create shipping detail if needed
    if (isShippingRequired && shippingAddress) {
      await ShippingDetail.create({
        orderId: order.id,
        name,
        address,
        city,
        pincode: shippingPincode,
        country,
        phone,
        pickupPincode: pickupLocation?.InventoryLocation?.pincode || null,
      }, { transaction });
    }

    // 8. Handle zero-total orders
    if (backendTotal === 0) {
      let status = productType === 'digital' ? 'delivered' : 'confirmed';
      if (productType === 'physical' && pickupLocation) {
        await pickupLocation.decrement(
          {
            quantity: Number(quantity),
            reservedQuantity: Number(quantity),
          },
          { transaction }
        );        
      }
      await order.update({ status, reservationExpiry: null }, { transaction });
      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: `Order created successfully. Status: ${status}.`,
        data: { order: { id: order.id, finalAmount: 0, status } },
      });
    }

    // 9. Initiate payment
    const endUser = await endUsers.findOne({ where: { id: endUserId }, transaction });
    if (!endUser) {
      await transaction.rollback();
      return next(new ErrorHandler("User not found", 404));
    }

    let paymentDetails = {};
    let paymentUrl = null;

    if (paymentMethod === 'cashfree') {
      console.log("Campaingn" , campaign)
      if (!campaign.payment || campaign.payment.length === 0) {
        await transaction.rollback();
        return next(new ErrorHandler("Cashfree configuration not found", 400));
      }
      const cashfreeConfig = campaign.payment[0];

      const notifyUrl = process.env.NOTIFICATION_URL || "https://xplr.live/api/v1/payment/cashfree/webhook";
      const redirectUrl = returnUrl || "https://xplr.live/payment/status";
      const apiUrl = process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg/orders";
      const apiVersion = process.env.CASHFREE_API_VERSION || "2022-09-01";

      const paymentData = {
        order_id: order.id,
        order_amount: backendTotal,
        order_currency: 'INR',
        customer_details: {
          customer_id: endUserId,
          customer_phone: endUser.countryCode ? `${endUser.countryCode}${endUser.phone}` : endUser.phone,
          customer_email: endUser.email || null,
          customer_name: endUser.name || null,
        },
        order_meta: {
          notify_url: notifyUrl,
          payment_methods: "cc,dc,ppc,ccc,emi,paypal,upi,nb,app,paylater",
        },
      };

      console.log("CashfreeApiKey" , cashfreeConfig.XClientId)
      console.log("CashfreeSecret", cashfreeConfig.XClientSecret)

      try {
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
          return next(new ErrorHandler("Failed to create Cashfree payment session", 500));
        }

        console.log("cf_order_id", response.data.cf_order_id)

        paymentDetails = {
          payment_session_id: response.data.payment_session_id,
          cf_order_id: response.data.cf_order_id,
          order_status: response.data.order_status,
          order_token: response.data.order_token,
        };
        paymentUrl = `${
          process.env.CASHFREE_CHECKOUT_URL || "https://sandbox.cashfree.com/pg/view"
        }/${response.data.payment_session_id}`;
      } catch (error) {
        await transaction.rollback();
        console.error("Cashfree error:", error.response ? error.response.data : error.message);
        return next(new ErrorHandler("Failed to initiate payment", 500));
      }
    } else {
      await transaction.rollback();
      return next(new ErrorHandler(`Payment method ${paymentMethod} not supported`, 400));
    }

    // 10. Update order with payment details
    await order.update({ paymentDetails }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Order created and payment session initiated successfully",
      data: {
        order: {
          id: order.id,
          finalAmount: backendTotal,
          status: order.status,
        },
        payment: {
          order_id: order.id,
          payment_session_id: paymentDetails.payment_session_id,
          payment_url: paymentUrl,
          order_token: paymentDetails.order_token,
        },
      },
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Order creation error:", error.response ? error.response.data : error.message);
    return next(new ErrorHandler(error.message, 500));
  }
});


const createOrders = asyncHandler(async (req, res, next) => {
  const {
    productId,
    variantId,
    quantity,
    shippingAddress,
    couponCode,
    campaignId,
    returnUrl,
    paymentMethod = 'cashfree',
    total: frontendTotal,
    shippingCharge: frontendShippingCharge,
    discount: frontendDiscount,
  } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ErrorHandler(errors.array()[0].msg, 400));
  }

  const { name, address, city, pincode: shippingPincode, country, phone } = shippingAddress || {};
  const endUserId = req.endUser.id;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Validate campaign
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

    // 2. Validate product + variant
    const product = await Product.findByPk(productId, {
      include: [
        {
          model: ProductVariant,
          where: { id: variantId },
          required: true,
          include: [{ model: Inventory, include: [InventoryLocation] }],
        },
        {
          model: Category,
          attributes: ['id', 'name'],
        },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      await transaction.rollback();
      return next(new ErrorHandler('Product or variant not found', 404));
    }

    const variant = product.ProductVariants[0];
    const productType = product.type; // 'physical', 'digital'
    let reservationExpiry = null;

    // 3. Pricing and shipping logic
    const price = parseFloat(variant.price);
    const subtotal = price * quantity;
    const weightInKg = convertToKg(parseFloat(variant.weight), variant.weight_unit);
    const isShippingRequired = productType === 'physical';

    let backendShippingCharge = 0;
    let pickupLocation = null;

    if (isShippingRequired) {
      if (!shippingAddress || !name || !address || !city || !shippingPincode || !country || !phone) {
        await transaction.rollback();
        return next(new ErrorHandler("Shipping address details are required for physical products", 400));
      }

      const availableStock = variant.Inventories.reduce((sum, inv) => sum + (inv.quantity - inv.reservedQuantity), 0);
      if (availableStock < quantity) {
        await transaction.rollback();
        return next(new ErrorHandler(`Only ${availableStock} item(s) available in stock`, 400));
      }

      const eligibleInventories = variant.Inventories.filter(inv => inv.quantity - inv.reservedQuantity >= quantity);
      if (eligibleInventories.length === 0) {
        await transaction.rollback();
        return next(new ErrorHandler(`No inventory available to reserve ${quantity} item(s)`, 400));
      }

      pickupLocation = eligibleInventories.find(inv => inv.InventoryLocation?.pincode === shippingPincode) || eligibleInventories[0];

      if (!pickupLocation || !pickupLocation.InventoryLocation) {
        await transaction.rollback();
        return next(new ErrorHandler("No eligible pickup location found", 400));
      }

      // Reserve stock from pickupLocation
      await pickupLocation.update(
        { reservedQuantity: pickupLocation.reservedQuantity + quantity },
        { transaction }
      );

      reservationExpiry = new Date(Date.now() + 60 * 60 * 1000);

      const totalWeight = weightInKg * quantity;
      // const { rate } = await fetchShippingRates(
      //   shippingPincode,
      //   totalWeight,
      //   pickupLocation.InventoryLocation.pincode
      // );
      // backendShippingCharge = rate;
    }

    // 4. Handle coupons
    let backendDiscount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      const { discount, coupon } = await validateAndApplyCoupon(
        req.endUser.id,
        product,
        quantity,
        couponCode
      );
      backendDiscount = discount;
      appliedCoupon = coupon;
    }

    const backendTotal = subtotal + backendShippingCharge - backendDiscount;

    // Ensure frontend values are numbers and non-negative
    if (frontendTotal != null && (isNaN(frontendTotal) || frontendTotal < 0)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid frontend total", 400));
    }
    if (frontendShippingCharge != null && (isNaN(frontendShippingCharge) || frontendShippingCharge < 0)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid frontend shipping charge", 400));
    }
    if (frontendDiscount != null && (isNaN(frontendDiscount) || frontendDiscount < 0)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid frontend discount", 400));
    }

    // Compare frontend and backend values
    const epsilon = 0.01;
    if (frontendTotal != null && Math.abs(frontendTotal - backendTotal) > epsilon) {
      await transaction.rollback();
      return next(new ErrorHandler(`Frontend total (${frontendTotal}) does not match backend total (${backendTotal})`, 400));
    }
    if (frontendShippingCharge != null && Math.abs(frontendShippingCharge - backendShippingCharge) > epsilon) {
      await transaction.rollback();
      return next(new ErrorHandler(`Frontend shipping charge (${frontendShippingCharge}) does not match backend shipping charge (${backendShippingCharge})`, 400));
    }
    if (frontendDiscount != null && Math.abs(frontendDiscount - backendDiscount) > epsilon) {
      await transaction.rollback();
      return next(new ErrorHandler(`Frontend discount (${frontendDiscount}) does not match backend discount (${backendDiscount})`, 400));
    }

    // 5. Create order
    const order = await Order.create({
      userId: endUserId,
      providerUserId: endUserId,
      date: new Date(),
      productId: product.id,
      variantId: variant.id,
      paymentDetails: {},
      productType,
      quantity,
      finalAmount: backendTotal,
      subtotal,
      shippingCharges: backendShippingCharge,
      discountAmount: backendDiscount,
      status: "pending",
      campaignId,
      couponId: appliedCoupon ? appliedCoupon.id : null,
      reservationExpiry,
      inventoryId: pickupLocation ? pickupLocation.id : null,
    }, { transaction });

    // 6. Create shipping detail if needed
    if (isShippingRequired && shippingAddress) {
      await ShippingDetail.create({
        orderId: order.id,
        name,
        address,
        city,
        pincode: shippingPincode,
        country,
        phone,
        pickupPincode: pickupLocation?.InventoryLocation?.pincode || null,
      }, { transaction });
    }

    // 7. Handle zero-total orders
    if (backendTotal === 0) {
      let status = 'confirmed';
      if (productType === 'digital') {
        status = 'delivered';
      }

      if (productType === 'physical' && pickupLocation) {
        await pickupLocation.update(
          {
            quantity: pickupLocation.quantity - quantity,
            reservedQuantity: pickupLocation.reservedQuantity - quantity,
          },
          { transaction }
        );
      }

      await order.update({ status, reservationExpiry: null }, { transaction });
      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: `Order created successfully. Status: ${status}.`,
        data: {
          order: {
            id: order.id,
            finalAmount: 0,
            status,
          },
        },
      });
    }

    // 8. Initiate payment
    const endUser = await endUsers.findOne({ where: { id: endUserId }, transaction });
    if (!endUser) {
      await transaction.rollback();
      return next(new ErrorHandler("User not found", 404));
    }

    let paymentDetails = {};
    let paymentUrl = null;

    if (paymentMethod === 'cashfree') {
      if (!campaign.payment || campaign.payment.length === 0) {
        await transaction.rollback();
        return next(new ErrorHandler("Cashfree configuration not found", 400));
      }
      const cashfreeConfig = campaign.payment[0];

      const notifyUrl = process.env.NOTIFICATION_URL || "https://xplr.live/api/v1/payment/cashfree/webhook";
      const redirectUrl = returnUrl || "https://xplr.live/payment/status";
      const apiUrl = process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg/orders";
      const apiVersion = process.env.CASHFREE_API_VERSION || "2022-09-01";

      const paymentData = {
        order_id: order.id,
        order_amount: backendTotal,
        order_currency: 'INR',
        customer_details: {
          customer_id: endUserId,
          customer_phone: endUser.countryCode ? `${endUser.countryCode}${endUser.phone}` : endUser.phone,
          customer_email: endUser.email || null,
          customer_name: endUser.name || null,
        },
        order_meta: {
          notify_url: notifyUrl,
          payment_methods: "cc,dc,ppc,ccc,emi,paypal,upi,nb,app,paylater",
        },
      };

      try {
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
          return next(new ErrorHandler("Failed to create Cashfree payment session", 500));
        }

        paymentDetails = {
          payment_session_id: response.data.payment_session_id,
          cf_order_id: response.data.cf_order_id,
          order_status: response.data.order_status,
          order_token: response.data.order_token,
        };
        paymentUrl = `${
          process.env.CASHFREE_CHECKOUT_URL || "https://sandbox.cashfree.com/pg/view"
        }/${response.data.payment_session_id}`;
      } catch (error) {
        await transaction.rollback();
        console.error("Cashfree error:", error.response ? error.response.data : error.message);
        return next(new ErrorHandler("Failed to initiate payment", 500));
      }
    } else {
      await transaction.rollback();
      return next(new ErrorHandler(`Payment method ${paymentMethod} not supported`, 400));
    }

    // 9. Update order with payment details
    await order.update({ paymentDetails }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Order created and payment session initiated successfully",
      data: {
        order: {
          id: order.id,
          finalAmount: backendTotal,
          status: order.status,
        },
        payment: {
          order_id: order.id,
          payment_session_id: paymentDetails.payment_session_id,
          payment_url: paymentUrl,
          order_token: paymentDetails.order_token,
        },
      },
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Error" , error.stack)
    console.error("Order creation error:", error.response ? error.response.data : error.message);
    return next(new ErrorHandler(error.message, 500));
  }
});

const createOrderss = asyncHandler(async (req, res, next) => {
  const {
    productId,
    variantId,
    quantity,
    shippingAddress,
    couponCode,
    campaignId,
    returnUrl,
    paymentMethod = 'cashfree',
    total: frontendTotal,
    shippingCharge: frontendShippingCharge,
    discount: frontendDiscount,
  } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ErrorHandler(errors.array()[0].msg, 400));
  }

  const { name, address, city, pincode: shippingPincode, country, phone } = shippingAddress || {};
  const endUserId = req.endUser.id;

  const transaction = await db.sequelize.transaction();

  try {
    // 1. Validate inputs
    if (!productId || !variantId || !quantity || !campaignId) {
      await transaction.rollback();
      return next(new ErrorHandler("Product ID, Variant ID, Quantity, and Campaign ID are required", 400));
    }
    if (quantity <= 0) {
      await transaction.rollback();
      return next(new ErrorHandler("Quantity must be greater than zero", 400));
    }

    // 2. Validate campaign
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

    // 3. Validate product and variant
    const product = await Product.findByPk(productId, {
      include: [
        {
          model: ProductVariant,
          where: { id: variantId },
          required: true,
          include: [{ model: Inventory, include: [InventoryLocation] }],
        },
        {
          model: Category,
          attributes: ['id', 'name'],
        },
      ],
      transaction,
    });
    if (!product) {
      await transaction.rollback();
      return next(new ErrorHandler("Product or variant not found", 404));
    }

    const variant = product.ProductVariants[0];
    const isShippingRequired = product.type === 'physical';

    // 4. Validate shipping for physical products
    if (isShippingRequired && (!shippingAddress || !name || !address || !city || !shippingPincode || !country || !phone)) {
      await transaction.rollback();
      return next(new ErrorHandler("Shipping address details are required for physical products", 400));
    }

    // 5. Pricing and stock logic
    const price = parseFloat(variant.price);
    const subtotal = price * quantity;
    let backendShippingCharge = 0;
    let pickupLocation = null;
    let reservationExpiry = null;

    if (isShippingRequired) {
      // Check stock
      const availableStock = variant.Inventories.reduce((sum, inv) => sum + (inv.quantity - inv.reservedQuantity), 0);
      if (availableStock === 0) {
        await transaction.rollback();
        return next(new ErrorHandler("No stock available", 400));
      }
      if (availableStock < quantity) {
        await transaction.rollback();
        return next(new ErrorHandler(`Only ${availableStock} item(s) available in stock`, 400));
      }

      // Select inventory
      const eligibleInventories = variant.Inventories.filter(inv => (inv.quantity - inv.reservedQuantity) >= quantity);
      if (!eligibleInventories.length) {
        await transaction.rollback();
        return next(new ErrorHandler(`No single inventory location has ${quantity} item(s) available`, 400));
      }

      pickupLocation = eligibleInventories.find(inv => inv.InventoryLocation?.pincode === shippingPincode) || eligibleInventories[0];
      if (!pickupLocation || !pickupLocation.InventoryLocation) {
        await transaction.rollback();
        return next(new ErrorHandler("No eligible pickup location found", 400));
      }

      // Reserve stock with optimistic locking
      const [updatedRows] = await Inventory.update(
        {
          reservedQuantity: db.sequelize.literal(`reservedQuantity + ${Number(quantity)}`),
        },
        {
          where: {
            id: pickupLocation.id,
            quantity: { [Op.gte]: db.sequelize.literal(`reservedQuantity + ${Number(quantity)}`) },
          },
          transaction,
        }
      );
      if (updatedRows !== 1) {
        await transaction.rollback();
        return next(new ErrorHandler("Failed to reserve stock due to concurrent updates", 400));
      }

      reservationExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours for webhook delays

      // Calculate shipping
      const weightInKg = convertToKg(parseFloat(variant.weight), variant.weight_unit);
      const totalWeight = weightInKg * quantity;
      try {
        const { rate } = await fetchShippingRates(
          shippingPincode,
          totalWeight,
          pickupLocation.InventoryLocation.pincode
        );
        backendShippingCharge = rate;
      } catch (error) {
        await transaction.rollback();
        console.error("Error fetching shipping rates:", error);
        return next(new ErrorHandler("Failed to calculate shipping charge", 500));
      }
    } else if (product.type !== 'digital') {
      await transaction.rollback();
      return next(new ErrorHandler("Unsupported product type", 400));
    }

    // 6. Handle coupons
    let backendDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      try {
        const { discount, coupon } = await validateAndApplyCoupon(
          endUserId,
          product,
          quantity,
          couponCode
        );
        backendDiscount = discount;
        appliedCoupon = coupon;
      } catch (error) {
        await transaction.rollback();
        return next(new ErrorHandler(error.message || "Invalid coupon code", 400));
      }
    }

    // 7. Calculate total
    const backendTotal = parseFloat((subtotal + backendShippingCharge - backendDiscount).toFixed(2));

    // 8. Validate frontend totals
    const epsilon = 0.01;
    if (frontendTotal != null && Math.abs(frontendTotal - backendTotal) > epsilon) {
      await transaction.rollback();
      return next(new ErrorHandler(`Frontend total (${frontendTotal}) does not match backend total (${backendTotal})`, 400));
    }
    if (frontendShippingCharge != null && Math.abs(frontendShippingCharge - backendShippingCharge) > epsilon) {
      await transaction.rollback();
      return next(new ErrorHandler(`Frontend shipping charge (${frontendShippingCharge}) does not match backend shipping charge (${backendShippingCharge})`, 400));
    }
    if (frontendDiscount != null && Math.abs(frontendDiscount - backendDiscount) > epsilon) {
      await transaction.rollback();
      return next(new ErrorHandler(`Frontend discount (${frontendDiscount}) does not match backend discount (${backendDiscount})`, 400));
    }

    // 9. Create order
    const order = await Order.create({
      userId: endUserId,
      providerUserId: endUserId,
      date: new Date(),
      productId: product.id,
      variantId: variant.id,
      paymentDetails: {},
      productType: product.type,
      quantity,
      finalAmount: backendTotal,
      subtotal,
      shippingCharges: backendShippingCharge,
      discountAmount: backendDiscount,
      status: "pending",
      campaignId,
      couponId: appliedCoupon ? appliedCoupon.id : null,
      reservationExpiry,
      inventoryId: pickupLocation ? pickupLocation.id : null,
    }, { transaction });

    // 10. Create shipping details
    if (isShippingRequired && shippingAddress) {
      await ShippingDetail.create({
        orderId: order.id,
        name,
        address,
        city,
        pincode: shippingPincode,
        country,
        phone,
        pickupPincode: pickupLocation.InventoryLocation.pincode,
      }, { transaction });
    }

    // 11. Handle zero-total orders
    if (backendTotal === 0) {
      let status = product.type === 'digital' ? 'delivered' : 'confirmed';
      if (isShippingRequired && pickupLocation) {
        const [deducted] = await Inventory.update(
          {
            quantity: db.sequelize.literal(`quantity - ${Number(quantity)}`),
            reservedQuantity: db.sequelize.literal(`reservedQuantity - ${Number(quantity)}`),
          },
          {
            where: {
              id: pickupLocation.id,
              quantity: { [Op.gte]: Number(quantity) },
              reservedQuantity: { [Op.gte]: Number(quantity) },
            },
            transaction,
          }
        );
        if (deducted !== 1) {
          await transaction.rollback();
          return next(new ErrorHandler("Failed to deduct stock for zero-total order", 400));
        }
      }
      await order.update({ status, reservationExpiry: null }, { transaction });
      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: `Order created successfully. Status: ${status}.`,
        data: { order: { id: order.id, finalAmount: 0, status } },
      });
    }

    // 12. Initiate payment
    const endUser = await endUsers.findOne({ where: { id: endUserId }, transaction });
    if (!endUser) {
      await transaction.rollback();
      return next(new ErrorHandler("User not found", 404));
    }

    let paymentDetails = {};
    let paymentUrl = null;

    if (paymentMethod === 'cashfree') {
      if (!campaign.payment || campaign.payment.length === 0) {
        await transaction.rollback();
        return next(new ErrorHandler("Cashfree configuration not found", 400));
      }
      const cashfreeConfig = campaign.payment[0];

      const notifyUrl = process.env.NOTIFICATION_URL || "https://xplr.live/api/v1/payment/cashfree/webhook";
      const redirectUrl = returnUrl || "https://xplr.live/payment/status";
      const apiUrl = process.env.CASHFREE_API_URL || "https://sandbox.cashfree.com/pg/orders";
      const apiVersion = process.env.CASHFREE_API_VERSION || "2022-09-01";

      const paymentData = {
        order_id: order.id,
        order_amount: backendTotal,
        order_currency: 'INR',
        customer_details: {
          customer_id: endUserId,
          customer_phone: endUser.countryCode ? `${endUser.countryCode}${endUser.phone}` : endUser.phone,
          customer_email: endUser.email || null,
          customer_name: endUser.name || null,
        },
        order_meta: {
          notify_url: notifyUrl,
          payment_methods: "cc,dc,ppc,ccc,emi,paypal,upi,nb,app,paylater",
        },
      };

      try {
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
          return next(new ErrorHandler("Failed to create Cashfree payment session", 500));
        }

        paymentDetails = {
          payment_session_id: response.data.payment_session_id,
          cf_order_id: response.data.cf_order_id,
          order_status: response.data.order_status,
          order_token: response.data.order_token,
        };
        paymentUrl = `${
          process.env.CASHFREE_CHECKOUT_URL || "https://sandbox.cashfree.com/pg/view"
        }/${response.data.payment_session_id}`;
      } catch (error) {
        await transaction.rollback();
        console.error("Cashfree error:", error.response ? error.response.data : error.message);
        return next(new ErrorHandler("Failed to initiate payment", 500));
      }
    } else {
      await transaction.rollback();
      return next(new ErrorHandler(`Payment method ${paymentMethod} not supported`, 400));
    }

    // 13. Update order with payment details
    await order.update({ paymentDetails }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Order created and payment session initiated successfully",
      data: {
        order: {
          id: order.id,
          finalAmount: backendTotal,
          status: order.status,
        },
        payment: {
          order_id: order.id,
          payment_session_id: paymentDetails.payment_session_id,
          payment_url: paymentUrl,
          order_token: paymentDetails.order_token,
        },
      },
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Order creation error:", error.response ? error.response.data : error.message);
    return next(error instanceof ErrorHandler ? error : new ErrorHandler(error.message || "Unexpected error in createOrder", 500));
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
  getUserOrders,
  buyNow,
  orderSummery
};