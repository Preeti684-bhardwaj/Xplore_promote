module.exports = (sequelize, DataTypes) => {
    const Transaction = sequelize.define("Transaction", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      amount: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      method:{
        type: DataTypes.JSON,
        allowNull: false,
      },
      status:{
        type: DataTypes.STRING
      },
      productDetails:{
        type: DataTypes.STRING,
        allowNull: true,
      },
      paymentDetails: {
        type: DataTypes.JSON
      },
    },
    {
      timestamps: true,
    });
  
    return Transaction;
  };