module.exports = (sequelize , DataTypes ) => {
  return sequelize.define('Order', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4,
        },
        providerUserId: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        date: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        invoiceNumber: {
            type: DataTypes.STRING
        },
        status: {
            type: DataTypes.ENUM("pending", "paid", "failed" , 'confirmed' , 'delivered' , 'shipped' ),
            defaultValue: "pending",
        },
        quantity: { 
            type: DataTypes.INTEGER, 
            allowNull: false, 
            validate: { min: 1 } 
        },
        productType: { 
            type: DataTypes.ENUM('physical', 'digital'), 
            allowNull: false 
        },
        finalAmount: { 
            type: DataTypes.DECIMAL(10, 2), 
            allowNull: false, 
            validate: { min: 0 } 
        },
        finalAmount: { 
            type: DataTypes.DECIMAL(10, 2), 
            allowNull: false, 
            validate: { min: 0 } 
        },
        shippingCharges: { 
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0 
        },
        discountAmount: { 
            type: DataTypes.DECIMAL(10, 2), 
            defaultValue: 0 
        },
        paymentDetails: {
            type: DataTypes.JSON,
        },
        shiprocketOrderId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        awbNumber: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        trackingLink: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        reservationExpiry: {
            type: DataTypes.DATE,
            allowNull: true,
        },
  }, 
  { 
     timestamps: true 
  });
};