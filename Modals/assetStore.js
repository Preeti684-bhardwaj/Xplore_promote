module.exports = (sequelize, DataTypes) => {
  const AssetStore = sequelize.define(
    "AssetStore",
    {
      assetStoreID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      assetData: DataTypes.JSON,
      fileType: {
        type: DataTypes.STRING,
        defaultValue: "others",
      },
    },
    {
      timestamps: false, // Disable automatic createdAt and updatedAt fields
    }
  );

  return AssetStore;
};
