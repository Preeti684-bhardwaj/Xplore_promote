module.exports = (sequelize, DataTypes) => {
    const saasPlan = sequelize.define('saasPlan', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        name: DataTypes.STRING,
        description: DataTypes.STRING,
        features:DataTypes.JSON
    },
    {
      timestamps: true,
    }
);
    return saasPlan;
};