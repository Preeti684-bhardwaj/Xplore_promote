module.exports = (sequelize, DataTypes) => {
    const SaasOrder = sequelize.define('SaasOrder', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        customerId:DataTypes.STRING,
        date: DataTypes.DATE,
        invoiceNumber: DataTypes.STRING,
        subscription: DataTypes.JSON,
        payment: DataTypes.JSON,
        status: DataTypes.STRING
    },
    {
      timestamps: true,
    });
    return SaasOrder;
};