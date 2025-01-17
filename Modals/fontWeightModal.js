module.exports = (sequelize, DataTypes) => {
    const FontWeight = sequelize.define("FontWeight", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: DataTypes.STRING,
      specificName:DataTypes.STRING,
      fontWeightFile: {
        type: DataTypes.JSON
      }
    });
    return FontWeight;
  };
  