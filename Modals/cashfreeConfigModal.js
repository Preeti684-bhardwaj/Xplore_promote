module.exports = (sequelize, DataTypes) => {
  const cashfreeConfig = sequelize.define(
    "cashfreeConfig",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      XClientId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      XClientSecret: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      provider: {
        type: DataTypes.STRING,
      },
    },
    {
      timestamps: true,
    }
  );
  return cashfreeConfig;
};
