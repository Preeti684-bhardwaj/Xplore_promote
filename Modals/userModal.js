module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define("User", {
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
      professionalEmail: DataTypes.STRING,
      countryCode: {
        type: DataTypes.STRING
      },
      phone: DataTypes.STRING,
      password: {
        type: DataTypes.STRING,
        allowNull: true, // Allow null for Apple Sign In users
      },
      isBusinessUser: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      visitorIds:{
        type: DataTypes.ARRAY(DataTypes.STRING)
      },
      deviceId: {
        type:DataTypes.ARRAY(DataTypes.STRING),
      },  
      userImages: {
        type:DataTypes.JSON
      },
      companyImages: {
        type:DataTypes.JSON
      },
      address: {
        type:DataTypes.JSON
      },
      userWebsites: {
        type:DataTypes.JSON
      },
      companyWebsite: {
        type:DataTypes.STRING
      },
      otp: DataTypes.STRING,
      otpExpire: DataTypes.DATE,
      IsActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
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
      isPhoneVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      authProvider: {
        type: DataTypes.ENUM('local', 'apple','google'),
        defaultValue: 'local',
      },
      profileLayoutJSon:{
      type: DataTypes.JSON
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    });
    return User;
  };