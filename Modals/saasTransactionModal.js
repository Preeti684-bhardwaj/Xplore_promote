module.exports = (sequelize, DataTypes) => {
    const SaasTransaction = sequelize.define('SaasTransaction', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        amount: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        currency: {
            type: DataTypes.STRING,
            allowNull: false
        },
        method: {
            type:  DataTypes.ARRAY(DataTypes.STRING),
            allowNull: false
        },
        status: {
            type: DataTypes.STRING,
            allowNull: false
        },
        paymentDetails: {
            type: DataTypes.JSON,
            allowNull: true
        }
    });

    return SaasTransaction;
};