module.exports = (sequelize, DataTypes) => {
  const Campaign = sequelize.define(
    "Campaign",
    {
      campaignID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
      },
      images: {
        type:DataTypes.ARRAY(DataTypes.JSON)
      },
      createdBy: {
        type: DataTypes.STRING,
      },
      createdDate: {
        type: DataTypes.DATE,
      },
      lastModifiedBy: {
        type: DataTypes.STRING,
      },
      lastModifiedDate: {
        type: DataTypes.DATE,
      },
      timing: {
        type: DataTypes.JSON,
      },
      campaignStatus: {
        type: DataTypes.ENUM('Starting Soon','Upcoming', 'Ongoing','Completed','Ending Soon'),
        defaultValue: 'Upcoming',
      },
      status: {
        type: DataTypes.JSON,
      },
      performance: {
        type: DataTypes.JSON,
      },
      socialMediaLinks: {
        type: DataTypes.JSON,
      },
      contactInfo: {
        type: DataTypes.JSON,
      },
      siteInfo: {
        type: DataTypes.JSON,
      },
      shortUrl:{
        type:DataTypes.STRING
      },
      shortCode:{
        type:DataTypes.STRING
      }
    },
    {
      timestamps: false, // Disable automatic createdAt and updatedAt fields
    }
  );

  return Campaign;
};
