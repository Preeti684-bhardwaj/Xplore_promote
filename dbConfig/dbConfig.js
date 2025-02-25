const {env}=require('../dbConfig/dbEnv.js')
const pg = require("pg");
const Sequelize = require("sequelize");
// console.log(env.password);

// Create Sequelize instance with error handling
let sequelize;
try {
  sequelize = new Sequelize(env.database, env.username, env.password, {
    host: env.host,
    dialect: env.dialect,
    dialectModule: pg,
    pool: {
      max: env.pool.max,
      min: env.pool.min,
      acquire: env.pool.acquire,
      idle: env.pool.idle,
    },
    dialectOptions: env.dialectOptions,
    logging: console.log,
  });
} catch (error) {
  console.error('Error creating Sequelize instance:', error);
  process.exit(1);
}

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
// db.endUsers=require("../Modals/endUserModal.js")(sequelize,Sequelize);
db.users = require("../Modals/userModal.js")(sequelize, Sequelize);
db.endusers=require("../Modals/endUserModal.js")(sequelize, Sequelize);
db.EndUserBrandVerification=require("../Modals/enduserbrandverificationModal.js")(sequelize, Sequelize);
db.admins = require("../Modals/adminModal.js")(sequelize, Sequelize);
db.campaigns = require("../Modals/campaignModal.js")(sequelize, Sequelize);
db.layouts = require("../Modals/layoutModal.js")(sequelize, Sequelize);
db.assets = require("../Modals/assetStore.js")(sequelize, Sequelize);
db.qrSessions = require("../Modals/qrSessionModal.js")(sequelize, Sequelize);
db.contacts = require("../Modals/contactDetailModal.js")(sequelize, Sequelize);
db.customFonts = require("../Modals/customFontModal.js")(sequelize, Sequelize);
db.productImages = require("../Modals/productImages.js")(sequelize, Sequelize);
db.analytics=require("../Modals/analyticsModal.js")(sequelize, Sequelize);
db.deletionRequest=require("../Modals/metaDeletionModal.js")(sequelize, Sequelize);
db.predibaseConfig = require("../Modals/predibaseConfigModal.js")(sequelize, Sequelize);
db.ragConfig = require("../Modals/ragConfigModel.js")(sequelize, Sequelize);
db.profileLayout = require("../Modals/profileLayoutModal.js")(sequelize, Sequelize);
db.FontWeight = require("../Modals/fontWeightModal.js")(sequelize, Sequelize);

// Define relationships
db.campaigns.hasMany(db.layouts, {
  foreignKey: "campaignID",
  as: "layouts",
  onDelete: "CASCADE", // Optional: deletes advertisement when campaign is deleted
});

db.layouts.belongsTo(db.campaigns, {
  foreignKey: "campaignID",
  as: "campaign",
  onDelete: "CASCADE", // Optional: deletes advertisement when campaign is deleted
});

// Establish relationship between Campaign and user
db.campaigns.belongsToMany(db.users, {
  through: "CampaignEndUser", // Sequelize automatically manages this table
  foreignKey: "campaignID",
  otherKey: "userID",
  as: "users",
});

db.users.belongsToMany(db.campaigns, {
  through: "CampaignEndUser",
  foreignKey: "userID",
  otherKey: "campaignID",
  as: "campaigns",
});

// Establish relationship between Campaign and enduser
db.campaigns.belongsToMany(db.endusers, {
  through: "CampaignUser", // Sequelize automatically manages this table
  foreignKey: "campaignID",
  otherKey: "enduserID",
  as: "endusers",
});

db.endusers.belongsToMany(db.campaigns, {
  through: "CampaignUser",
  foreignKey: "enduserID",
  otherKey: "campaignID",
  as: "campaigns",
});
//  // relationship between customFonts and fontWeight
db.customFonts.hasMany(db.FontWeight, {
  foreignKey: 'customFontId', // Foreign key in FontWeight table
  as: 'fontWeights', // Alias for the related data
});

// FontWeight belongs to one customFont
db.FontWeight.belongsTo(db.customFonts, {
  foreignKey: 'customFontId', // Foreign key in FontWeight table
  as: 'customFont', // Alias for the related data
});

// relationship between customFonts and Campaign
db.campaigns.hasMany(db.customFonts, {
  foreignKey: "campaignID",
  as: "customFonts",
  onDelete: "CASCADE", // Optional: deletes customFont when campaign is deleted
});

db.customFonts.belongsTo(db.campaigns, {
  foreignKey: "campaignID",
  as: "campaign",
  onDelete: "CASCADE", // Optional: deletes customFont when campaign is deleted
});

// relationship between customFonts and User
db.users.hasMany(db.customFonts, {
  foreignKey: "userId",
  as: "customFonts",
  onDelete: "CASCADE", // Optional: deletes customFont when campaign is deleted
});

db.customFonts.belongsTo(db.users, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE", // Optional: deletes customFont when campaign is deleted
});

// relationship between productImages and Campaign
db.campaigns.hasMany(db.productImages, {
  foreignKey: "campaignID",
  as: "productImages",
  onDelete: "CASCADE", // Optional: deletes customFont when campaign is deleted
});

db.productImages.belongsTo(db.campaigns, {
  foreignKey: "campaignID",
  as: "campaign",
  onDelete: "CASCADE", // Optional: deletes customFont when campaign is deleted
});

// contact-Campaign relationship
db.campaigns.hasMany(db.analytics, {
  foreignKey: "campaignID",
  as: 'analytics',
  onDelete: 'CASCADE' // Optional: deletes campaign when user is deleted
});

db.analytics.belongsTo(db.campaigns, {
  foreignKey: 'campaignID',
  as: 'campaigns',
  onDelete: 'CASCADE' // Optional: deletes campaign when user is deleted
});

// User-AssetStore relationship
db.users.hasOne(db.assets, {
  foreignKey: "userId",
  as: "asset",
  onDelete: "CASCADE", // Optional: deletes asset when user is deleted
});

db.assets.belongsTo(db.users, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE", // Optional: deletes asset when user is deleted
});

// User-QRSession relationship
db.users.hasMany(db.qrSessions, {
  foreignKey: "userId",
  as: "qrSessions",
  onDelete: "CASCADE", // Optional: deletes all QR sessions when the user is deleted
});

db.qrSessions.belongsTo(db.users, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE", // Optional: deletes the QR session when the associated user is deleted
});

// predibase config - campaign relationship
db.campaigns.hasOne(db.predibaseConfig, {
  foreignKey: "campaignId",
  as: "predibase",
  onDelete: "CASCADE", // Optional: deletes predibase when campaign is deleted
});

db.predibaseConfig.belongsTo(db.campaigns, {
  foreignKey: "campaignId",
  as: "campaigns",
  onDelete: "CASCADE", // Optional: deletes predibase config when campaign is deleted
});

// ragConfig config - campaign relationship
db.campaigns.hasOne(db.ragConfig, {
  foreignKey: "campaignId",
  as: "rag",
  onDelete: "CASCADE", // Optional: deletes rag config when campaign is deleted
});

db.ragConfig.belongsTo(db.campaigns, {
  foreignKey: "campaignId",
  as: "rag",
  onDelete: "CASCADE", // Optional: deletes rag config when campaign is deleted
});

db.users.hasMany(db.profileLayout, {
  foreignKey: "userId",
  as: "layouts",
  onDelete: "CASCADE", // Optional: deletes layout when user is deleted
});

db.profileLayout.belongsTo(db.users, {
  foreignKey: "userId",
  as: "users",
  onDelete: "CASCADE", // Optional: deletes layout when user is deleted
});

module.exports = db;
