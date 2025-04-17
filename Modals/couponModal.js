// module.exports = (sequelize, DataTypes) => {
//   const Coupon = sequelize.define('Coupon', {
//     id: {
//       type: DataTypes.INTEGER,
//       primaryKey: true,
//       autoIncrement: true,
//     },
//     couponCode: {
//       type: DataTypes.STRING(20),
//       allowNull: false,
//     },
//     type: {
//       type: DataTypes.ENUM('flat', 'percentage'),
//       allowNull: false,
//     },
//     amount: {
//       type: DataTypes.DECIMAL(10, 2),
//       validate: { min: 0 },
//     },
//     percentage: {
//       type: DataTypes.INTEGER,
//       validate: { min: 0, max: 100 },
//     },
//     maxDiscount: {
//       type: DataTypes.DECIMAL(10, 2),
//       validate: { min: 0 },
//     },
//     minValue: {
//       type: DataTypes.DECIMAL(10, 2),
//       allowNull: false,
//       validate: { min: 0 },
//     },
//     startDate: {
//       type: DataTypes.DATE,
//       allowNull: false,
//     },
//     expiryDate: {
//       type: DataTypes.DATE,
//       allowNull: false,
//     },
//     isOneTimeUse: {
//       type: DataTypes.BOOLEAN,
//       defaultValue: false,
//     },
//     userLimit: {
//       type: DataTypes.INTEGER,
//       validate: { min: 1 },
//     },
//     globalUsageLimit: {
//       type: DataTypes.INTEGER,
//       validate: { min: 1 },
//     },
//     globalUsedCount: {
//       type: DataTypes.INTEGER,
//       defaultValue: 0,
//     },
//     isActive: {
//       type: DataTypes.BOOLEAN,
//       defaultValue: true,
//     },
//   }, {
//     timestamps: true,
//     indexes: [
//       {
//         unique: true,
//         fields: ['couponCode', 'userId'], // Unique per creator
//         name: 'unique_couponCode_userId',
//       },
//     ],
//   });

//   return Coupon;
// };