// module.exports = (sequelize, DataTypes) => {
//   const CouponUsage = sequelize.define('CouponUsage', {
//     id: {
//       type: DataTypes.UUID,
//       defaultValue: DataTypes.UUIDV4,
//       primaryKey: true,
//     },
//     userId: {
//       type: DataTypes.UUID,
//       allowNull: false,
//       references: { model: 'users', key: 'id' },
//     },
//     couponId: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//       references: { model: 'Coupons', key: 'id' },
//     },
//     usedAt: {
//       type: DataTypes.DATE,
//       defaultValue: DataTypes.NOW,
//     },
//   }, {
//     indexes: [
//       {
//         unique: true,
//         fields: ['userId', 'couponId'],
//         name: 'unique_coupon_per_user',
//       },
//     ],
//     timestamps: true,
//   });

//   return CouponUsage;
// };