module.exports = (sequelize, DataTypes) => {
    const QRSession = sequelize.define('QRSession', {
        channel: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
        token: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    }, {
        timestamps: false,
    });

    return QRSession;
};