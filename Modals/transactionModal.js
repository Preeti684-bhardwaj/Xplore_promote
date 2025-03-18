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
        type: DataTypes.DATE,
        allowNull: false,
      },
      method:{
        type: DataTypes.STRING,
        allowNull: false,
      },
      status:{
        type: DataTypes.STRING
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