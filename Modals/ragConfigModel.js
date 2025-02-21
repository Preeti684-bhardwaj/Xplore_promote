module.exports = (sequelize, DataTypes) => {
  const RagConfig = sequelize.define(
    "RagConfig",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      qdrant_api_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      qdrant_url: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      collection_name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      llm_key: {
        type: DataTypes.STRING,
      },
      llm_model_name: {
        type: DataTypes.STRING,
      },
    },
    {
      timestamps: true,
    }
  );
  return RagConfig;
};
