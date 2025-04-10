const { env } = require("../dbConfig/dbEnv.js");
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
  console.error("Error creating Sequelize instance:", error);
  process.exit(1);
}

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
db.users = require("../Modals/userModal.js")(sequelize, Sequelize);
db.endUsers = require("../Modals/endUserModal.js")(sequelize, Sequelize);
db.EndUserBrandVerification =
  require("../Modals/enduserbrandverificationModal.js")(sequelize, Sequelize);
db.admins = require("../Modals/adminModal.js")(sequelize, Sequelize);
db.campaigns = require("../Modals/campaignModal.js")(sequelize, Sequelize);
db.layouts = require("../Modals/layoutModal.js")(sequelize, Sequelize);
db.assets = require("../Modals/assetStore.js")(sequelize, Sequelize);
db.qrSessions = require("../Modals/qrSessionModal.js")(sequelize, Sequelize);
db.contacts = require("../Modals/contactDetailModal.js")(sequelize, Sequelize);
db.customFonts = require("../Modals/customFontModal.js")(sequelize, Sequelize);
db.productImages = require("../Modals/productImages.js")(sequelize, Sequelize);
db.analytics = require("../Modals/analyticsModal.js")(sequelize, Sequelize);
db.deletionRequest = require("../Modals/metaDeletionModal.js")(
  sequelize,
  Sequelize
);
db.chatBotConfig = require("../Modals/ChatBotConfigModal.js")(
  sequelize,
  Sequelize
);
db.profileLayout = require("../Modals/profileLayoutModal.js")(
  sequelize,
  Sequelize
);
db.FontWeight = require("../Modals/fontWeightModal.js")(sequelize, Sequelize);
db.whatsappConfig = require("../Modals/whatsappConfigModal.js")(
  sequelize,
  Sequelize
);
db.smsConfig = require("../Modals/smsConfigModal.js")(sequelize, Sequelize);
db.cashfreeConfig = require("../Modals/cashfreeConfigModal.js")(
  sequelize,
  Sequelize
);
db.order = require("../Modals/orderModal.js")(sequelize, Sequelize);
db.transaction = require("../Modals/transactionModal.js")(sequelize, Sequelize);
db.Collection = require("../Modals/collectionModal.js")(sequelize, Sequelize);
db.Product = require("../Modals/productModal.js")(sequelize, Sequelize);
db.ProductVariant = require("../Modals/productVariantModal.js")(
  sequelize,
  Sequelize
);
db.Tag = require("../Modals/tagModal.js")(sequelize, Sequelize);
db.Attribute = require("../Modals/attributeModal.js")(sequelize, Sequelize);
db.Inventory = require("../Modals/inventoryModal.js")(sequelize, Sequelize);
db.InventoryLocation = require("../Modals/inventoryLocationModal.js")(
  sequelize,
  Sequelize
);



// Define relationships
db.campaigns.hasMany(db.layouts, {
  foreignKey: "campaignID",
  as: "layouts",
  onDelete: "CASCADE",
});

db.layouts.belongsTo(db.campaigns, {
  foreignKey: "campaignID",
  as: "campaign",
  onDelete: "CASCADE",
});

// Establish relationship between Campaign and user
db.campaigns.belongsToMany(db.users, {
  through: "CampaignEndUser",
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
db.campaigns.belongsToMany(db.endUsers, {
  through: "CampaignUser",
  foreignKey: "campaignID",
  otherKey: "enduserID",
  as: "endusers",
});

db.endUsers.belongsToMany(db.campaigns, {
  through: "CampaignUser",
  foreignKey: "enduserID",
  otherKey: "campaignID",
  as: "campaigns",
});
//  // relationship between customFonts and fontWeight
db.customFonts.hasMany(db.FontWeight, {
  foreignKey: "customFontId",
  as: "fontWeights",
});

// FontWeight belongs to one customFont
db.FontWeight.belongsTo(db.customFonts, {
  foreignKey: "customFontId",
  as: "customFont",
});

// relationship between customFonts and Campaign
db.campaigns.hasMany(db.customFonts, {
  foreignKey: "campaignID",
  as: "customFonts",
  onDelete: "CASCADE",
});

db.customFonts.belongsTo(db.campaigns, {
  foreignKey: "campaignID",
  as: "campaign",
  onDelete: "CASCADE",
});

// relationship between customFonts and User
db.users.hasMany(db.customFonts, {
  foreignKey: "userId",
  as: "customFonts",
  onDelete: "CASCADE",
});

db.customFonts.belongsTo(db.users, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE",
});
// chatbotconfig - campaign relationship
db.campaigns.hasOne(db.chatBotConfig, {
  foreignKey: "campaignId",
  as: "chatbot",
  onDelete: "CASCADE",
});

db.chatBotConfig.belongsTo(db.campaigns, {
  foreignKey: "campaignId",
  as: "campaigns",
  onDelete: "CASCADE",
});

// relationship between chatbot and User
db.users.hasMany(db.chatBotConfig, {
  foreignKey: "userId",
  as: "chatbot",
  onDelete: "CASCADE",
});

db.chatBotConfig.belongsTo(db.users, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE",
});

// relationship between whatsapp and User
db.users.hasMany(db.whatsappConfig, {
  foreignKey: "userId",
  as: "whatsapp",
  onDelete: "CASCADE",
});

db.whatsappConfig.belongsTo(db.users, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE",
});

// chatbotconfig - campaign relationship
db.campaigns.hasOne(db.whatsappConfig, {
  foreignKey: "campaignId",
  as: "whatsapp",
  onDelete: "CASCADE",
});

db.whatsappConfig.belongsTo(db.campaigns, {
  foreignKey: "campaignId",
  as: "campaigns",
  onDelete: "CASCADE",
});

// relationship between smsConfig and User
db.users.hasMany(db.smsConfig, {
  foreignKey: "userId",
  as: "sms",
  onDelete: "CASCADE",
});

db.smsConfig.belongsTo(db.users, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE",
});

// chatbotconfig - campaign relationship
db.campaigns.hasOne(db.smsConfig, {
  foreignKey: "campaignId",
  as: "sms",
  onDelete: "CASCADE",
});

db.smsConfig.belongsTo(db.campaigns, {
  foreignKey: "campaignId",
  as: "campaigns",
  onDelete: "CASCADE",
});
// relationship between cashfreeConfig and User
db.users.hasMany(db.cashfreeConfig, {
  foreignKey: "userId",
  as: "payment",
  onDelete: "CASCADE",
});

db.cashfreeConfig.belongsTo(db.users, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE",
});
// relationship between cashfreeConfig and Campaign
db.campaigns.belongsToMany(db.cashfreeConfig, {
  through: "cashfreePayment",
  foreignKey: "campaignID",
  otherKey: "cashfreeConfigId",
  as: "payment",
});

db.cashfreeConfig.belongsToMany(db.campaigns, {
  through: "cashfreePayment",
  foreignKey: "cashfreeConfigId",
  otherKey: "campaignID",
  as: "campaigns",
});

// relationship between productImages and Campaign
db.campaigns.hasMany(db.productImages, {
  foreignKey: "campaignID",
  as: "productImages",
  onDelete: "CASCADE",
});

db.productImages.belongsTo(db.campaigns, {
  foreignKey: "campaignID",
  as: "campaign",
  onDelete: "CASCADE",
});

// contact-Campaign relationship
db.campaigns.hasMany(db.analytics, {
  foreignKey: "campaignID",
  as: "analytics",
  onDelete: "CASCADE",
});

db.analytics.belongsTo(db.campaigns, {
  foreignKey: "campaignID",
  as: "campaigns",
  onDelete: "CASCADE",
});

// User-AssetStore relationship
db.users.hasOne(db.assets, {
  foreignKey: "userId",
  as: "asset",
  onDelete: "CASCADE",
});

db.assets.belongsTo(db.users, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE",
});

// User-QRSession relationship
db.users.hasMany(db.qrSessions, {
  foreignKey: "userId",
  as: "qrSessions",
  onDelete: "CASCADE",
});

db.qrSessions.belongsTo(db.users, {
  foreignKey: "userId",
  as: "user",
  onDelete: "CASCADE",
});

// relationship between profileLayout and User
db.users.hasMany(db.profileLayout, {
  foreignKey: "userId",
  as: "layouts",
  onDelete: "CASCADE",
});

db.profileLayout.belongsTo(db.users, {
  foreignKey: "userId",
  as: "users",
  onDelete: "CASCADE",
});

// relationship between order and User
db.endUsers.hasMany(db.order, {
  foreignKey: "userId",
  as: "orders",
  onDelete: "CASCADE",
});

db.order.belongsTo(db.endUsers, {
  foreignKey: "userId",
  as: "users",
  onDelete: "CASCADE",
});

// relationship between order and User
db.campaigns.hasMany(db.order, {
  foreignKey: "campaignId",
  as: "orders",
});

db.order.belongsTo(db.campaigns, {
  foreignKey: "campaignId",
  as: "campaign",
  onDelete: "CASCADE",
});

// relationship order - transaction
db.order.hasOne(db.transaction, {
  foreignKey: "orderId",
  as: "transaction",
  onDelete: "CASCADE",
});

db.transaction.belongsTo(db.order, {
  foreignKey: "orderId",
  as: "order",
  onDelete: "CASCADE",
});

// ---------------product relationships----------------

// relationship between collection and User
db.users.hasMany(db.Collection, {
  foreignKey: "user_id",
  as: "collections"
});

// A collection belongs to a user
db.Collection.belongsTo(db.users, {
  foreignKey: "user_id", 
  as: "user"
});
// Many-to-many relationship with products
db.Collection.belongsToMany(db.Product, {
  through: "ProductCollection",
  foreignKey: "collection_id",
  otherKey: "product_id",
});

// A product can have many variants
db.Product.hasMany(db.ProductVariant, { foreignKey: "product_id" });

// Many-to-many relationship with collections
db.Product.belongsToMany(db.Collection, {
  through: "ProductCollection",
  foreignKey: "product_id",
  otherKey: "collection_id",
});

// Many-to-many relationship with tags
db.Product.belongsToMany(db.Tag, {
  through: "ProductTag",
  foreignKey: "product_id",
  otherKey: "tag_id",
});

// A variant belongs to a product
db.ProductVariant.belongsTo(db.Product, { foreignKey: "product_id" });

// A variant can have inventory in multiple locations
db.ProductVariant.hasMany(db.Inventory, { foreignKey: "variant_id" });

// A variant can have attributes
db.ProductVariant.belongsToMany(db.Attribute, {
  through: "VariantAttribute",
  foreignKey: "variant_id",
  otherKey: "attribute_id",
});

// Inventory belongs to a variant
db.Inventory.belongsTo(db.ProductVariant, { foreignKey: "variant_id" });

// Inventory belongs to a location
db.Inventory.belongsTo(db.InventoryLocation, { foreignKey: "location_id" });

// Many-to-many relationship with products
db.Tag.belongsToMany(db.Product, {
  through: "ProductTag",
  foreignKey: "tag_id",
  otherKey: "product_id",
});

// Many-to-many relationship with variants
db.Attribute.belongsToMany(db.ProductVariant, {
  through: "VariantAttribute",
  foreignKey: "attribute_id",
  otherKey: "variant_id",
});

// A location can have many inventories
db.InventoryLocation.hasMany(db.Inventory, { foreignKey: "location_id" });
module.exports = db;
