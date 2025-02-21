module.exports = (sequelize, DataTypes) => {
    const EndUserBrandVerification = sequelize.define("EndUserBrandVerification", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      enduserId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      brandId: { // This will store the campaign creator's user ID
        type: DataTypes.UUID,
        allowNull: false,
      },
      isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      verifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      }
    });
    return EndUserBrandVerification;
  };