const { body } = require('express-validator');

const validateCreateOrder = [
  body('productId')
    .notEmpty().withMessage('Product ID is required')
    .isUUID().withMessage("Product ID must be valid UUID"),

  body('variantId')
    .notEmpty().withMessage('Variant ID is required')
    .isUUID().withMessage("Variant ID must be valid UUID"),

  body('quantity')
    .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),

  body('paymentMethod')
    .optional()
    .isIn(['cashfree']).withMessage('Invalid payment method'),

  body('campaignId')
    .notEmpty().withMessage('Campaign ID is required')
    .isUUID().withMessage("Campaign ID must be valid UUID"),

  body('couponCode')
    .optional()
    .isString().withMessage('Coupon code must be a string'),

  body('total')
    .optional()
    .isFloat({ min: 0 }).withMessage('Total must be a valid number'),

  body('shippingCharge')
    .optional()
    .isFloat({ min: 0 }).withMessage('Shipping charge must be a valid number'),

  body('discount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Discount must be a valid number'),

  // Shipping Address fields validation (if shippingAddress is present)
  body('shippingAddress').if(body('shippingAddress').exists()).custom((value) => {
    const { name, address, city, pincode, country, phone } = value || {};

    if (!name || !address || !city || !pincode || !country || !phone) {
        throw new Error('All shipping address fields (name, address, city, pincode, country, phone) are required');
    }

    return true;
  }),

  body('shippingAddress.name')
    .if(body('shippingAddress').exists())
    .notEmpty().withMessage('Shipping name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
    .matches(/^[A-Za-z\s]+$/).withMessage('Name can only contain letters and spaces'),


  body('shippingAddress.address')
    .if(body('shippingAddress').exists())
    .notEmpty().withMessage('Shipping address is required'),

  body('shippingAddress.city')
    .if(body('shippingAddress').exists())
    .notEmpty().withMessage('City is required'),

  body('shippingAddress.pincode')
    .if(body('shippingAddress').exists())
    .notEmpty().withMessage('Pincode is required')
    .isPostalCode('IN').withMessage('Invalid Indian pincode'),

  body('shippingAddress.country')
    .if(body('shippingAddress').exists())
    .notEmpty().withMessage('Country is required'),

  body('shippingAddress.phone')
    .if((value, { req }) => req.body.productType === 'physical' || !req.body.productType)
    .notEmpty().withMessage('Phone is required')
    .isMobilePhone('en-IN').withMessage('Invalid Indian phone number'),
];


const validateOrderSummery = [
    body('productId')
      .notEmpty().withMessage('Product ID is required')
      .isUUID().withMessage("Product ID must be valid UUID"),
  
    body('variantId')
      .notEmpty().withMessage('Variant ID is required')
      .isUUID().withMessage("Variant ID must be valid UUID"),
  
    body('quantity')
      .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),

  
    body('campaignId')
      .notEmpty().withMessage('Campaign ID is required')
      .isUUID().withMessage("Campaign ID must be valid UUID"),
  
    body('couponCode')
      .optional()
      .isString().withMessage('Coupon code must be a string'),
  
    body('shippingPincode')
      .optional()
      .isPostalCode('IN').withMessage('Invalid Indian pincode')
];

const validateBuyNow = [
    body('productId')
      .notEmpty().withMessage('Product ID is required')
      .isUUID().withMessage("Product ID must be valid UUID"),
  
    body('variantId')
      .notEmpty().withMessage('Variant ID is required')
      .isUUID().withMessage("Variant ID must be valid UUID"),
  
    body('quantity')
      .isInt({ min: 1 }).withMessage('Quantity must be at least 1'),

    body('campaignId')
      .notEmpty().withMessage('Campaign ID is required')
      .isUUID().withMessage("Campaign ID must be valid UUID"),
]


module.exports = {
  validateCreateOrder,
  validateBuyNow,
  validateOrderSummery
};
