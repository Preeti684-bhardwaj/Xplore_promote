// module.exports = (sequelize, DataTypes) => {
//   const CouponProduct = sequelize.define('CouponProduct', {
//     id: {
//       type: DataTypes.UUID,
//       defaultValue: DataTypes.UUIDV4,
//       primaryKey: true,
//     },
//     couponId: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//       references: { model: 'Coupons', key: 'id' },
//     },
//     productId: {
//       type: DataTypes.UUID,
//       allowNull: false,
//       references: { model: 'Products', key: 'id' },
//     },
//   }, {
//     timestamps: true,
//   });

//   return CouponProduct;
// };