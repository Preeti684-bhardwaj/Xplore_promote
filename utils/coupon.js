// const { Coupon, CouponUsage, CouponProduct, CouponCategory } = require('../models');
// const db = require("../../dbConfig/dbConfig.js");
// const Coupon = db.Coupon
// const CouponUsage = db.CouponUsage
// const CouponProduct = db.CouponProduct
// const CouponCategory = db.CouponCategory
// const ErrorHandler = require('./ErrorHandler');

// const validateAndApplyCoupon = async (userId, product, quantity, couponCode) => {
//  try {

//    const couponCreatorId = product?.category.id
//    // Find coupon by couponCode and creator's userId
//    const coupon = await Coupon.findOne({
//      where: { couponCode, userId: couponCreatorId, isActive: true },
//      include: [
//        { model: CouponProduct, as: 'applicableProducts' },
//        { model: CouponCategory, as: 'applicableCategories' },
//      ],
//    });
 
//    if (!coupon) throw new ErrorHandler('Invalid or inactive coupon code' , 400);
 
//    const now = new Date();
//    if (now < new Date(coupon.startDate)) throw new ErrorHandler('Coupon is not active yet' , 400);
//    if (now > new Date(coupon.expiryDate)) throw new ErrorHandler('Coupon has expired' , 400);
 
//    const productTotal = product.ProductVariants[0]?.price * quantity;
//    if (productTotal < coupon.minValue) throw new ErrorHandler('Purchase value too low' , 400);
 
//    // Applicability check
//    const productIds = coupon.applicableProducts?.map(p => p.id);
//    const categoryIds = coupon.applicableCategories?.map(c => c.id);
 
//    const productAllowed = !productIds?.length || productIds.includes(product.id);
//    const categoryAllowed = !categoryIds?.length || categoryIds.includes(product.category?.id);
 
//    if (!productAllowed && !categoryAllowed) {
//      throw new ErrorHandler('Coupon is not applicable for this product or category' , 400);
//    }
 
//    // Usage check
//    if (coupon.isOneTimeUse) {
//      const totalUsed = await CouponUsage.count({ where: { couponId: coupon.id  } });
//      if (totalUsed > 0) throw new ErrorHandler('Coupon already used' , 400);
//    }
 
//    if (coupon.globalUsageLimit && coupon.globalUsedCount >= coupon.globalUsageLimit) {
//      throw new ErrorHandler('Coupon usage limit reached globally' , 400);
//    }
 
//    const usageCount = await CouponUsage.count({ where: { userId, couponId: coupon.id } });
//    if (coupon.userLimit && usageCount >= coupon.userLimit) {
//      throw new ErrorHandler('You have already used this coupon maximum allowed times' , 400);
//    }
 
//    // Calculate discount
//    let discount = 0;
//    if (coupon.type === 'flat') {
//      discount = coupon.amount;
//    } else if (coupon.type === 'percentage') {
//      discount = (coupon.percentage / 100) * productTotal;
//      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
//        discount = coupon.maxDiscount;
//      }
//    }
 
//    return { discount, coupon };
//  } catch (error) {
//    throw new ErrorHandler(error.message , 500)
//  }
// };

// module.exports = { validateAndApplyCoupon };
