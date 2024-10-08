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
        allowNull: false,
      },
      phone: DataTypes.STRING,
      password: {
        type: DataTypes.STRING,
        allowNull: true, // Allow null for Apple Sign In users
      },
      otp: DataTypes.STRING,
      otpExpire: DataTypes.DATE,
      IsActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      isEmailVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      // appleUserId: {
      //   type: DataTypes.STRING,
      //   unique: true,
      // },
      // authProvider: {
      //   type: DataTypes.ENUM('local', 'apple'),
      //   defaultValue: 'local',
      // },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    });
    return User;
  };