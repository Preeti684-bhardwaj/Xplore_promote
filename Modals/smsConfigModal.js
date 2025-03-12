module.exports = (sequelize, DataTypes) => {
  const smsConfig = sequelize.define(
    "smsConfig",
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
      account_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      api_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      otherDetails: {
        type: DataTypes.JSON,
      },
      base_url: {
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
  return smsConfig;
};
