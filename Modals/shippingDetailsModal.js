module.exports = (sequelize , DataTypes) => {
  const Shipping =  sequelize.define(
    'ShippingDetail', 
    {
        id: { 
            type: DataTypes.UUID, 
            defaultValue: DataTypes.UUIDV4, 
            primaryKey: true 
        },
        name:{
            type: DataTypes.STRING,
            allowNull: false
        },
        address: { 
            type: DataTypes.STRING(255), 
            allowNull: false 
        },
        city: { 
            type: DataTypes.STRING(100), 
            allowNull: false 
        },
        pincode: { 
            type: DataTypes.STRING(10), 
            allowNull: false, 
            validate: { len: [5, 10] }
        },
        contry:{
            type: DataTypes.STRING,
            default: "India"
        },
        phone: { 
            type: DataTypes.STRING(15), 
            allowNull: false, 
            validate: { len: [10, 15] } 
        },
        pickupPincode: {
            type: DataTypes.STRING(10), 
            allowNull: true, 
            validate: { len: [5, 10] }
        },
    }, 
    {  
        timestamps: false 
    });

   return Shipping
};