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
    ssl:{
      require: true,
      rejectUnauthorized: false // Use this if you're using a self-signed certificate
    }
  }
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
db.users = require("../Modals/userModal.js")(sequelize, Sequelize);
db.campaigns = require("../Modals/campaignModal.js")(sequelize, Sequelize);
db.advertisements = require("../Modals/advertisementModal.js")(sequelize, Sequelize);
db.layouts = require("../Modals/layoutModal.js")(sequelize, Sequelize);
db.assets = require("../Modals/assetStore.js")(sequelize, Sequelize);

// Define relationships
db.campaigns.hasMany(db.advertisements, {
  foreignKey: 'campaignID',
  as: 'advertisements',
  onDelete: 'CASCADE' // Optional: deletes advertisement when campaign is deleted
});

db.advertisements.belongsTo(db.campaigns, {
  foreignKey: 'campaignID',
  as: 'campaign',
    onDelete: 'CASCADE' // Optional: deletes advertisement when campaign is deleted
});

db.advertisements.hasMany(db.layouts, {
  foreignKey: 'advertisementID',
  as: 'layouts',
  onDelete: 'CASCADE' // Optional: deletes layout when advertisement is deleted
});

db.layouts.belongsTo(db.advertisements, {
  foreignKey: 'advertisementID',
  as: 'advertisement',
  onDelete: 'CASCADE' // Optional: deletes layout when advertisement is deleted
});

// User-Campaign relationship
db.users.hasMany(db.campaigns, {
  foreignKey: 'createdBy',
  as: 'campaigns',
  onDelete: 'CASCADE' // Optional: deletes campaign when user is deleted
});

db.campaigns.belongsTo(db.users, {
  foreignKey: 'createdBy',
  as: 'creator',
  onDelete: 'CASCADE' // Optional: deletes campaign when user is deleted
});

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

module.exports = db;