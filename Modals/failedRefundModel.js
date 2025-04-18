module.exports = (sequelize, DataTypes) => {
    const FailedRefunds = sequelize.define(
      "FailedRefunds",
      {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: false,
        },
      },
      {
        timestamps: true,
      }
    );
  
    return FailedRefunds;
  };