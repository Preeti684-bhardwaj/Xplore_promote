module.exports = (sequelize, DataTypes) => {
    const Advertisement = sequelize.define("Advertisement", {
      advertisementID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    });
  
    return Advertisement;
  };