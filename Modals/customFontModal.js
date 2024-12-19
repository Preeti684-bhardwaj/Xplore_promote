module.exports = (sequelize, DataTypes) => {
    const CustomFont = sequelize.define("CustomFont", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: DataTypes.STRING,
      fontWeight: {
        type: DataTypes.JSON,
      }
    });
    return CustomFont;
  };
  