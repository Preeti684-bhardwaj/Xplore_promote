module.exports = (sequelize, DataTypes) => {
  const Analytics = sequelize.define(
    "Analytics",
    {
      source: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true,
          isIn: [["facebook", "instagram", "twitter", "qr", "direct", "other"]], // Add valid sources
        },
      },
      device: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "Unknown",
        validate: {
          notEmpty: true,
          isIn: [["ios", "android", "windows", "unknown"]], // Add valid sources
        },
      },
      ipAddress: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      deviceId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      timeZone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      deviceName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      osVersion: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      buildNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      osName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      screenWidth: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      appName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      region: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [2, 2], // Country codes are typically 2 characters
        },
      },
      screenHeight: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      deviceModel: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      appVersion: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      language: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [2, 5], // Language codes are typically 2-5 characters
        },
      },
    },
    {
      timestamps: true,
    }
  );

  return Analytics;
};
