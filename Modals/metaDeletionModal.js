module.exports = (sequelize, DataTypes) => {
  const DeletionRequest = sequelize.define(
    "deletionRequest",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      confirmationCode: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
      },
      status: {
        type:  DataTypes.ENUM("pending", "completed", "user_not_found"),
        defaultValue: "pending",
      },
    },
    {
      timestamps: true,
    }
  );
  return DeletionRequest;
};