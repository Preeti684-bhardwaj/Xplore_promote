module.exports = (sequelize, DataTypes) => {
    const whatsappConfig = sequelize.define(
      "whatsappConfig",
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        version: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        phone_number_id: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        meta_app_access_token: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        webhook_verify_token: {
          type: DataTypes.STRING,
        },
       redirectin_url: {
          type: DataTypes.STRING,
        },
      },
      {
        timestamps: true,
      }
    );
    return RagConfig;
  };
  