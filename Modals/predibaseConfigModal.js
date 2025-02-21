module.exports = (sequelize, DataTypes) => {
  const PredibaseConfig = sequelize.define(
    "PredibaseConfig",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      tenant_id: {
        type: DataTypes.STRING,
        // allowNull: false,
      },
      deployment_name: {
        type: DataTypes.STRING,
        // allowNull: false,
      },
      api_token: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      adapter_source: {
        type: DataTypes.STRING,
        defaultValue: "pbase",
      },
      adapter_name:{
        type: DataTypes.STRING,
      },
      adapter_id: {
        type: DataTypes.STRING,
      },
      max_new_tokens: {
        type: DataTypes.INTEGER,
        defaultValue: 500,
      },
      json_file:{
        type: DataTypes.TEXT,
      },
      csv_file: {
        type: DataTypes.TEXT,
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
  return PredibaseConfig;
};
