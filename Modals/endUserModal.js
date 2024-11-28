module.exports = (sequelize, DataTypes) => {
    const EndUser = sequelize.define("EndUser", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: DataTypes.STRING,
      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      countryCode: {
        type: DataTypes.STRING
      },
      phone: DataTypes.STRING,
      address: {
        type:DataTypes.JSON
      },
      otherDetails: {
        type: DataTypes.JSON
      },
      visitorIds:{
        type: DataTypes.ARRAY(DataTypes.STRING)
      },
      deviceId: {
        type:DataTypes.ARRAY(DataTypes.STRING),
      },  
      appleUserId: {
        type: DataTypes.STRING,
        unique: true,
      },
      googleUserId:{
        type: DataTypes.STRING,
        unique: true,
      },
      isEmailVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      authProvider: {
        type: DataTypes.ENUM('local', 'apple','google'),
        defaultValue: 'local',
      },
      isInterestedProducts: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        unique: true,
      },
      contactInfo: {
        type: DataTypes.JSON
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    });
    return EndUser;
  };