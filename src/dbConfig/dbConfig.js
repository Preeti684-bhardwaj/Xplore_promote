const env = require("./dbEnv.js");
const pg = require("pg");

const Sequelize = require("sequelize");
console.log( env.password)
const sequelize = new Sequelize(env.database, env.username, env.password, {
  host: env.host,
  dialect: env.dialect,
  dialectModule: pg,

  pool: {
    max: env.pool.max,
    min: env.pool.min,
    acquire: env.pool.acquire,
    idle: env.pool.idle,
  }
});


const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.users = require("../Modals/userModal.js")(sequelize, Sequelize);


// Relationships


module.exports = db;