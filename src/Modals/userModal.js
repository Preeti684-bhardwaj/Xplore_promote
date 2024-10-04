module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        name:DataTypes.STRING,
        email: {
            type: DataTypes.STRING,
            allowNull: false
        },
        phone: DataTypes.STRING,
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        otp:DataTypes.STRING,
        otpExpire:DataTypes.DATE,
        IsActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        isEmailVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE
    });
    return User;
};