module.exports = (sequelize, DataTypes) => {
    const Layout = sequelize.define("Layout", {
      layoutID: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      layoutJSON: {
        type: DataTypes.JSON,
        allowNull: false,
      },
    });
  
    return Layout;
  };