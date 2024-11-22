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
        allowNull: false,
      },
      countryCode: {
        type: DataTypes.STRING
      },
      phone: DataTypes.STRING,
      address: {
        type:DataTypes.JSON
      },
      visitorIds:{
        type: DataTypes.ARRAY(DataTypes.STRING)
      },
      appleUserId: {
        type: DataTypes.STRING,
        unique: true,
      },
      googleUserId:{
        type: DataTypes.STRING,
        unique: true,
      },
      authProvider: {
        type: DataTypes.ENUM('local', 'apple','google'),
        defaultValue: 'local',
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    });
    return EndUser;
  };