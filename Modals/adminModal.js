module.exports = (sequelize, Sequelize) => {
    const Admin = sequelize.define('admin', {
        id: {
            type: Sequelize.UUID,
            primaryKey: true, 
            defaultValue: Sequelize.UUIDV4
        },
        email: {
            type: Sequelize.STRING,
            allowNull: false
        },
        password: {
            type: Sequelize.STRING,
            allowNull: false
        },
        IsActivated: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },
        IsEmailVerified: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },
        createdAt: Sequelize.DATE,
        updatedAt: Sequelize.DATE
    });
    return Admin;
};

