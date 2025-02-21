module.exports = (sequelize, DataTypes) => {
  const Enduser = sequelize.define("Enduser", {
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
      type: DataTypes.STRING,
    },
    phone: DataTypes.STRING,
    password: {
      type: DataTypes.STRING,
      allowNull: true, // Allow null for Apple Sign In users
    },
    visitorIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    deviceId: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    userImages: {
      type: DataTypes.JSON,
    },
    otp: DataTypes.STRING,
    otpExpire: DataTypes.DATE,
    metaOtp: DataTypes.STRING,
    metaOtpExpire: DataTypes.DATE,
    authState: DataTypes.UUID,
    stateExpiry: DataTypes.DATE,
    lastOtpSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp of the last OTP sent to track rate limiting",
    },
    otpAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of failed OTP verification attempts",
    },
    IsActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    appleUserId: {
      type: DataTypes.STRING,
      unique: true,
    },
    googleUserId: {
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
      type: DataTypes.ENUM("local", "apple", "google"),
      defaultValue: "local",
    },
    role: {
      type: DataTypes.ENUM("ADMIN", "USER", "CLIENT"),
      defaultValue: "USER",
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  });
  return Enduser;
};
