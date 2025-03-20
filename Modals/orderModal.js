module.exports = (sequelize, DataTypes) => {
    const Order = sequelize.define("Order", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      providerUserId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      invoiceNumber:{
        type: DataTypes.STRING,
        allowNull: false,
      },
      productDetails:{
        type: DataTypes.STRING,
        allowNull: false,
      },
      paymentDetails: {
        type: DataTypes.JSON
      }
    },
    {
      timestamps: true,
    });
  
    return Order;
  };