// module.exports = (sequelize, DataTypes) => {
//   const CouponCategory = sequelize.define('CouponCategory', {
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
//     categoryId: {
//       type: DataTypes.UUID,
//       allowNull: false,
//       references: { model: 'Categories', key: 'id' },
//     },
//   }, {
//     timestamps: true,
//   });

//   return CouponCategory;
// };