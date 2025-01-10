module.exports = (sequelize, DataTypes) => {
  const ModelConfig = sequelize.define("ModelConfig", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    tenant_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    deployment_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    api_token: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    adapter_source: {
      type: DataTypes.STRING,
      defaultValue: "pbase",
    },
    adapter_id: {
      type: DataTypes.STRING,
    },
    max_new_tokens: {
      type: DataTypes.INTEGER,
      defaultValue: 128,
    },
    temperature: {
      type: DataTypes.FLOAT,  
      defaultValue: 0.2,
    },
    top_p: {
      type: DataTypes.FLOAT,  
      defaultValue: 0.1,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastUsed: {
      type: DataTypes.DATE,
    },
    requestCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  });
  return ModelConfig;
};
