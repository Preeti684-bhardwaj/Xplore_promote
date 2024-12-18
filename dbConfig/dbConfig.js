const env = require("./dbEnv.js");
const pg = require("pg");
const Sequelize = require("sequelize");
console.log(env.password);

const sequelize = new Sequelize(env.database, env.username, env.password, {
  host: env.host,
  dialect: env.dialect,
  dialectModule: pg,
  pool: {
    max: env.pool.max,
    min: env.pool.min,
    acquire: env.pool.acquire,
    idle: env.pool.idle,
  },
  dialectOptions: {
    //   ssl:{
    //    require: true,
    //    rejectUnauthorized: false
    // }
  ssl: false,
  }
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
// db.endUsers=require("../Modals/endUserModal.js")(sequelize,Sequelize);
db.users = require("../Modals/userModal.js")(sequelize, Sequelize);
db.admins=require("../Modals/adminModal.js")(sequelize,Sequelize);
db.campaigns = require("../Modals/campaignModal.js")(sequelize, Sequelize);
// db.advertisements = require("../Modals/advertisementModal.js")(sequelize, Sequelize);
db.layouts = require("../Modals/layoutModal.js")(sequelize, Sequelize);
db.assets = require("../Modals/assetStore.js")(sequelize, Sequelize);
db.qrSessions = require("../Modals/qrSessionModal.js")(sequelize, Sequelize);
db.contacts=require("../Modals/contactDetailModal.js")(sequelize, Sequelize);

// Define relationships
db.campaigns.hasMany(db.layouts, {
  foreignKey: 'campaignID',
  as: 'layouts',
  onDelete: 'CASCADE' // Optional: deletes advertisement when campaign is deleted
});

db.layouts.belongsTo(db.campaigns, {
  foreignKey: 'campaignID',
  as: 'campaign',
    onDelete: 'CASCADE' // Optional: deletes advertisement when campaign is deleted
});

// Establish relationship between Campaign and EndUser
db.campaigns.belongsToMany(db.users, {
  through: 'CampaignEndUser', // Sequelize automatically manages this table
  foreignKey: 'campaignID',
  otherKey: 'userID',
  as: 'users',
});

db.users.belongsToMany(db.campaigns, {
  through: 'CampaignEndUser',
  foreignKey: 'userID',
  otherKey: 'campaignID',
  as: 'campaigns',
});

 // If you want to track the creator separately
//  db.campaigns.belongsTo(db.users, {
//   foreignKey: 'createdBy',
//   as: 'creator',
// });

// db.users.hasMany(db.campaigns, {
//   foreignKey: 'createdBy',
//   as: 'createdCampaigns',
// });

// db.advertisements.hasMany(db.layouts, {
//   foreignKey: 'advertisementID',
//   as: 'layouts',
//   onDelete: 'CASCADE' // Optional: deletes layout when advertisement is deleted
// });

// db.layouts.belongsTo(db.advertisements, {
//   foreignKey: 'advertisementID',
//   as: 'advertisement',
//   onDelete: 'CASCADE' // Optional: deletes layout when advertisement is deleted
// });

// contact-Campaign relationship
// db.users.hasMany(db.campaigns, {
//   foreignKey: "contactId",
//   as: 'campaigns',
//   onDelete: 'CASCADE' // Optional: deletes campaign when user is deleted
// });

// db.campaigns.belongsTo(db.contacts, {
//   foreignKey: 'contactId',
//   as: 'contact',
//   onDelete: 'CASCADE' // Optional: deletes campaign when user is deleted
// });

// User-AssetStore relationship
db.users.hasOne(db.assets, {
  foreignKey: 'userId',
  as: 'asset',
  onDelete: 'CASCADE' // Optional: deletes asset when user is deleted
});

db.assets.belongsTo(db.users, {
  foreignKey: 'userId',
  as: 'user',
  onDelete: 'CASCADE' // Optional: deletes asset when user is deleted
});

// User-QRSession relationship
db.users.hasMany(db.qrSessions, {
  foreignKey: 'userId',
  as: 'qrSessions',
  onDelete: 'CASCADE' // Optional: deletes all QR sessions when the user is deleted
});

db.qrSessions.belongsTo(db.users, {
  foreignKey: 'userId',
  as: 'user',
  onDelete: 'CASCADE' // Optional: deletes the QR session when the associated user is deleted
});

module.exports = db;
