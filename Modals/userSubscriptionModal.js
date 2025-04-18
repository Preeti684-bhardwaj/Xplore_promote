module.exports = (sequelize, DataTypes) => {
    const UserSubscription = sequelize.define('UserSubscription', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        features: DataTypes.JSON,
        frequency: DataTypes.ENUM('monthly', 'quarterly', 'half-yearly', 'annually'),
        plan: DataTypes.STRING,
        price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        startDate: DataTypes.DATE,
        endDate: DataTypes.DATE
    },
        {
            timestamp: true
        }
    );
    return UserSubscription;
};