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
      designation:{
        type: DataTypes.STRING,
      },
      userImage: {
        type: DataTypes.JSON,
      },
      layoutJSON: {
        type: DataTypes.JSON,
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