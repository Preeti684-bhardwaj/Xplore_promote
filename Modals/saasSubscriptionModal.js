module.exports = (sequelize, DataTypes) => {
    const SubscriptionPlan = sequelize.define('subscriptionPlan', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        frequency: DataTypes.ENUM('monthly', 'quarterly', 'half-yearly', 'annually'),
        price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        }
    },
        {
            timestamps: true,
        });
    return SubscriptionPlan;
};