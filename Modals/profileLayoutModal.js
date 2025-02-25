module.exports = (sequelize, DataTypes) => {
    const ProfileLayout = sequelize.define("ProfileLayout", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      layoutJSON: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      cdnDetails:{
        type: DataTypes.JSON,
      },
      shortUrl: {
        type: DataTypes.STRING,
      },
      shortCode: {
        type: DataTypes.STRING,
      },
    });
  
    return ProfileLayout
  };