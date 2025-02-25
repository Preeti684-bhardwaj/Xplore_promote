module.exports = (sequelize, DataTypes) => {
  const ChatBotConfig = sequelize.define(
    "ChatBotConfig",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING,
        // allowNull: false,
      },
      api_key: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      otherDetails:{
        type:DataTypes.JSON
      },
      json_file:{
        type: DataTypes.STRING,
      },
      base_prompt: {
        type: DataTypes.TEXT,
        // allowNull: false,
      },
    },
    {
      timestamps: true,
    }
  );
  return ChatBotConfig;
};
