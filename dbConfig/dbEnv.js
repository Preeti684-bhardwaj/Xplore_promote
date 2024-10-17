require("dotenv").config();

const env = {
  database: process.env.DATABASE,
  username: "default",
  password: process.env.PASSWORD,
  host: process.env.HOST,
  dialect: process.env.DIALECT,
  pool: {
    max: 15,
    min: 0,
    acquire: 90000,
    idle: 30000,
  },
  port: 5432,
};

module.exports = env;
