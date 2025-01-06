require("dotenv").config();

const env = {
  database: process.env.DATABASE,
  username: "xploreliveuser",
  password: process.env.PASSWORD,
  host: process.env.HOST,
  dialect: process.env.DIALECT,
  pool: {
    max: 15,
    min: 0,
    acquire: 90000,    // 90 seconds - this looks good
    idle: 30000,       // 30 seconds - this is fine
  },
  dialectOptions: {
    statement_timeout: 30000,        // 30 seconds for queries
    idle_in_transaction_session_timeout: 60000,  // 60 seconds
    connectTimeout: 60000            // 60 seconds
  },
  retry: {
    max: 3,                         // Retry failed queries 3 times
    match: [/Deadlock/i, /Timeout/i]  // Retry on these errors
  },
  port: 5432,
  logging: console.log,             // For debugging connection issues
};

module.exports = env;