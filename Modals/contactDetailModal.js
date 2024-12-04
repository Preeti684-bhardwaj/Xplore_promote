module.exports = (sequelize, DataTypes) => {
  const ContactUs = sequelize.define("ContactUs", {
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
      type: DataTypes.STRING,
    },
    phone: DataTypes.STRING,
    otherDetails: {
      type: DataTypes.JSON,
    },
    address: {
      type: DataTypes.JSON,
    },
    isInterestedProducts: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    //   unique: true,
    },
    visitorIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    deviceId: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    campaignId: {
      type: DataTypes.UUID,
      references: {
        model: "Campaigns",
        key: "campaignID",
      },
    },
  });
  return ContactUs;
};
