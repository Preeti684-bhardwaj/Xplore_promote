module.exports = (sequelize, DataTypes) => {
  const paymentConfig = sequelize.define(
    "paymentConfig",
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
      secret_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      api_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      webhook_url: {
        type: DataTypes.STRING,
      },
      redirection_url: {
        type: DataTypes.STRING,
      },
      provider: {
        type: DataTypes.STRING,
      },
    },
    {
      timestamps: true,
    }
  );
  return paymentConfig;
};
