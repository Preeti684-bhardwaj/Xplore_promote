module.exports = (sequelize, DataTypes) => {
    const whatsappConfig = sequelize.define(
      "whatsappConfig",
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        name:{
          type: DataTypes.STRING,
          allowNull: false,
        },
        otp_template_name :{
          type: DataTypes.STRING,
          allowNull: false,
        },
        link_template_name :{
          type: DataTypes.STRING,
          allowNull: false,
        },
        version: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: "v17.0", // Default Meta API version
        },
        phone_number_id: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        meta_app_access_token: {
          type: DataTypes.TEXT, // Using TEXT for potentially long tokens
          allowNull: false,
        },
        webhook_verify_token: {
          type: DataTypes.STRING,
        },
      },
      {
        timestamps: true,
      }
    );
    return whatsappConfig;
  };
  