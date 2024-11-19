const app = require("./app.js")
const db = require("./dbConfig/dbConfig.js")
require("dotenv").config({path:"./.env"})
const passport = require('passport');
const passportJWT = require('passport-jwt');
const setupSocket = require('./utils/socketSetup.js');

process.on("uncaughtException" , (err)=>{
    console.log(`Error: ${err.message}`)
    console.log(`Shutting down the server due to uncaught Exception`)
    process.exit(1)
})

// jwt verification 
let ExtractJwt = passportJWT.ExtractJwt;
let JwtStrategy = passportJWT.Strategy;

let jwtOptions = {};
jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
jwtOptions.secretOrKey = process.env.JWT_SECRET;
jwtOptions.passReqToCallback = true;

let strategy = new JwtStrategy(jwtOptions, function (req, jwt_payload, done) {
  var Model = jwt_payload.obj.type === 'USER' ? db.users : null;
  
  Model.findOne({ where: { id: jwt_payload.obj.obj.id } })
    .then(user => {
      if (user) {
        let obj = {
          type: jwt_payload.obj.type,
          obj: user
        };
        return done(null, obj);
      } else {
        return done(null, false);
      }
    })
    .catch(error => {
      return done(null, false);
    });
});

passport.use('jwt', strategy);

// connectDB()
// database connection
db.sequelize.sync({ alter: true })
    .then(() => {
        const server = app.listen(process.env.PORT || 9190, () => {
            console.log(`⚙️ Server is running at port : ${process.env.PORT}`);
        });

       // Pass db to setupSocket
       const io = setupSocket(server);
        app.set('io', io); 

        process.on("unhandledRejection", (err) => {
            console.log(`Error: ${err.message}`);
            console.log(`Shutting down the server due to Unhandled Promise Rejection`);

            server.close(() => {
                process.exit(1);
            });
        });
    })
    .catch((err) => {
        console.log("db connection failed !!! ", err);
        process.exit(1);
    });