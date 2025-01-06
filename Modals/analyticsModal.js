module.exports = (sequelize, DataTypes) => {
  const Analytics = sequelize.define(
    "Analytics",
    {
      source: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true,
          isIn: [['Facebook', 'Instagram', 'Twitter', 'QR', 'Direct', 'Other']] // Add valid sources
        }
      },
      device: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Unknown',
        validate: {
          notEmpty: true,
          isIn: [['ios' , 'android' , 'windows','unknown']] // Add valid sources
        }
      },
      ipAddress: {
        type: DataTypes.STRING,
        validate: {
          isIP: true
        }
      },
      deviceId: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      timestamps: true,
    }
  );

  return Analytics;
};