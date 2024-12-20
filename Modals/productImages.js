module.exports = (sequelize, DataTypes) => {
    const ProductImages = sequelize.define("ProductImages", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      productModalId:DataTypes.STRING,
      productName: DataTypes.STRING,
      imageBaseUrl:DataTypes.STRING,
      vr_exterior: {
        type: DataTypes.ARRAY(DataTypes.JSON),
      },
      vr_interior: {
        type: DataTypes.ARRAY(DataTypes.JSON),
      },
    });
    return ProductImages;
  };
  