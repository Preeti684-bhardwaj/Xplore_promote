const db = require("../../dbConfig/dbConfig.js");
const Admin = db.admins;
const User = db.users;
const Layout = db.layouts;
const Campaign = db.campaigns;
const Contact=db.contacts;
const sequelize = db.sequelize;
const asyncHandler = require("../../utils/asyncHandler.js");
const ErrorHandler = require("../../utils/ErrorHandler.js");
const bcrypt = require("bcrypt");
const {getPagination} = require("../../validators/campaignValidations.js");
const {generateToken,hashPassword} = require("../../validators/userValidation.js");
const {getCampaignStatus} = require("../../utils/campaignStatusManager.js");
const {isValidEmail,isValidPassword,isValidLength} = require("../../validators/validation.js");

// -------------------ADMIN SIGNUP------------------------------------------------------
const adminSignup = asyncHandler(async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if ([email, password].some((field) => field?.trim() === "")) {
      return next(new ErrorHandler("All required fields must be filled", 400));
    }
    if (!email) {
      return next(new ErrorHandler("Email is missing", 400));
    }
    if (!password) {
      return next(new ErrorHandler("Password is missing", 400));
    }
    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase().trim();
    // Validate email format
    if (!isValidEmail(lowercaseEmail)) {
      return next(new ErrorHandler("Invalid email", 400));
    }
    const existingAdmin = await Admin.findOne({
      where: { email: lowercaseEmail },
    });

    if (existingAdmin) {
      return next(new ErrorHandler("Email already in use", 409));
    }

    // Validate the password and create a new user
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return next(new ErrorHandler(passwordValidationResult, 400));
    }

    const hashedPassword = await hashPassword(password);

    const admin = await Admin.create({
      email,
      password: hashedPassword,
    });
    return res.status(201).send({
      success: true,
      message: "Admin created successfully",
      id: admin.id,
      email: admin.email,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// --------------------------ADMIN SIGNIN-----------------------------------------------------
const adminSignin = asyncHandler(async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || email.trim() === "" || password.trim() === "") {
      return next(new ErrorHandler("Email and Password are required", 400));
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Convert the email to lowercase for case-insensitive comparison
    const lowercaseEmail = email.toLowerCase().trim();
    const admin = await Admin.findOne({ where: { email: lowercaseEmail } });
    if (!admin) {
      return next(new ErrorHandler("admin not found.", 400));
    }
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res
        .status(400)
        .send({ status: false, message: "Invalid password." });
    }

    const obj = {
      type: "ADMIN",
      obj: {
        id: admin.id,
        email: admin.email,
      },
    };

    const token = generateToken(obj);

    return res.status(200).send({
      status: true,
      message: "login successful",
      id: admin.id,
      email: admin.email,
      token: token,
      // Add additional fields as necessary
    });
  } catch (error) {
    return res.status(500).send({
      status: false,
      message: error.message || "Some error occurred during signin.",
    });
  }
});

// ------------------FORGET PASSWORD-------------------------------------------------------
// const forgotPassword = asyncHandler(async (req, res) => {
//   try {
//     const { email } = req.body;

//     if (!email) {
//       return res
//         .status(400)
//         .send({ status: false, message: "email is missing" });
//     }

//     const adminInfo = await Admin.findOne({
//       where: {
//         email: email.trim(),
//       },
//     });

//     if (!adminInfo) {
//       return res
//         .status(404)
//         .send({ status: false, message: "admin not found" });
//     }
//     return res.status(200).send({
//       success: true,
//       message: "valid email",
//       adminID: adminInfo.id,
//     });
//   } catch (error) {
//     return res
//       .status(500)
//       .send({ status: false, message: error.message || "An error occurred" });
//   }
// });

// // -----------------RESET PASSWORD-------------------------------------------------
// const resetPassword = asyncHandler(async (req, res) => {
//   try {
//     const { password } = req.body;
//     const adminId = req.params.adminId;

//     if (!password) {
//       return res
//         .status(400)
//         .send({ status: false, message: "Password is missing" });
//     }

//     const findAdmin = await Admin.findByPk(adminId);

//     if (!findAdmin) {
//       return res
//         .status(404)
//         .send({ status: false, message: "admin not found" });
//     }
//     const hashedPassword = await bcrypt.hash(password, 10);
//     findAdmin.password = hashedPassword;

//     await findAdmin.save({ validate: false });

//     const loggedInAdmin = await Admin.findByPk(findAdmin.id, {
//       attributes: {
//         exclude: ["password"],
//       },
//     });

//     return res.status(200).json({
//       success: true,
//       data: loggedInAdmin,
//     });
//   } catch (error) {
//     returnres
//       .status(500)
//       .send({ status: false, message: error.message || "An error occurred" });
//   }
// });

// ------------update business user----------------------------------
const updateBusinessUser = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return next(new ErrorHandler("Email is missing", 400));
    }
    const lowercaseEmail = email.toLowerCase().trim();
    const user = await User.findOne({ where: { email: lowercaseEmail } });
    if (!user) {
      return next(new ErrorHandler("User not found", 400));
    }
    // Update the isBusinessUser field to true
    await user.update({ isBusinessUser: true });

    res.status(200).json({
      success: true,
      message: "User successfully updated to business user",
      user: {
        id: user.id,
        email: user.email,
        isBusinessUser: true,
      },
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// ------------create client login----------------------------------
const createClientLogin = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { name, email, password } = req.body;
    if (!name) {
      return next(new ErrorHandler("Name is missing", 400));
    }
    if (!email) {
      return next(new ErrorHandler("Email is missing", 400));
    }
    if (!password) {
      return next(new ErrorHandler("Password is missing", 400));
    }
    // Sanitize name: trim and reduce multiple spaces to a single space
    name.trim().replace(/\s+/g, " ");

    // Validate name
    const nameError = isValidLength(name);
    if (nameError) {
      return next(new ErrorHandler(nameError, 400));
    }
    const lowercaseEmail = email.toLowerCase().trim();
    if (!isValidEmail(lowercaseEmail)) {
      return next(new ErrorHandler("Invalid email", 400));
    }
    // Validate the password and create a new user
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return next(new ErrorHandler(passwordValidationResult, 400));
    }

    const hashedPassword = await hashPassword(password);
    // Find or create user
    let user;
    try {
      [user, created] = await User.findOrCreate({
        where: { email: lowercaseEmail },
        defaults: {
          name: name,
          email: lowercaseEmail,
          password: hashedPassword, // Hash password
          isBusinessUser: true,
          role: "CLIENT",
        },
        transaction,
      });

      // If user exists, update fields
      // If user exists, update fields
      if (!created || !user.isBusinessUser || user.role !== "CLIENT") {
        await user.update(
          {
            password: hashedPassword,
            isBusinessUser: true,
            role: "CLIENT",
          },
          { transaction }
        );
      }
      // Commit transaction
      await transaction.commit();

      // Prepare response (exclude password)
      const userResponse = {
        id: user.id,
        name: user.name,
        email: user.email,
        isBusinessUser: user.isBusinessUser,
        role: user.role,
      };

      return res.status(200).json({
        success: true,
        message: created
          ? "New user created successfully"
          : "User updated successfully",
        user: userResponse,
      });
    } catch (findOrCreateError) {
      // Rollback transaction in case of error
      await transaction.rollback();

      // Check for unique constraint violations
      if (findOrCreateError.name === "SequelizeUniqueConstraintError") {
        return next(new ErrorHandler("Email already exists", 409));
      }

      // For other errors
      return next(new ErrorHandler(findOrCreateError.message, 500));
    }
  } catch (error) {
    // Ensure transaction is rolled back
    if (transaction) {
      await transaction.rollback();
    }

    // Log the error for internal tracking
    console.error("Client Login Error:", error);

    // Send generic error response
    return next(new ErrorHandler("An unexpected error occurred", 500));
  }
});

// ----------------assign campaign to client-----------------------------
const assignCampaignToClient = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { clientId, campaignID } = req.body;
    
    // Input validation
    if (!campaignID) {
      return next(new ErrorHandler("Campaign ID is required.", 400));
    }
    if (!clientId) {
      return next(new ErrorHandler("Client ID is required.", 400));
    }

    // Check if the campaign exists
    const campaign = await db.campaigns.findByPk(campaignID, { 
      transaction,
      attributes: ['campaignID', 'name'] 
    });
    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found.", 404));
    }

    // Find the user with role check
    const existingUser = await db.users.findOne({
      where: { 
        id: clientId,
        role: "CLIENT" 
      },
      transaction,
    });

    // User existence and role validation
    if (!existingUser) {
      await transaction.rollback();
      return next(new ErrorHandler("User doesn't exist or is not authorized", 404));
    }

    // Check if the user is already associated with this specific campaign
    const isUserAssociated = await campaign.hasUser(existingUser, { transaction });

    // If already associated, return existing association
    if (isUserAssociated) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        message: "User is already registered for this campaign.",
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
        },
        campaign: {
          campaignID: campaign.campaignID,
          name: campaign.name,
        },
      });
    }

    // Associate user with the campaign
    await campaign.addUser(existingUser, { transaction });

    // Commit transaction
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "User successfully associated with campaign.",
      user: {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email
      },
      campaign: {
        campaignID: campaign.campaignID,
        name: campaign.name,
      },
    });

  } catch (error) {
    // Ensure transaction is rolled back
    if (transaction) {
      await transaction.rollback();
    }

    // Log the error for internal tracking
    console.error("Campaign Assignment Error:", error);

    // Send generic error response
    return next(new ErrorHandler("An unexpected error occurred", 500));
  }
});

//--------------remove campaign from client-----------------------------------------
const removeCampaignFromClient = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { clientId, campaignID } = req.body;
    
    // Input validation
    if (!campaignID) {
      return next(new ErrorHandler("Campaign ID is required.", 400));
    }
    if (!clientId) {
      return next(new ErrorHandler("Client ID is required.", 400));
    }

    // Check if the campaign exists
    const campaign = await db.campaigns.findByPk(campaignID, { 
      transaction,
      attributes: ['campaignID', 'name'] 
    });
    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found.", 404));
    }

    // Find the user with role check
    const existingUser = await db.users.findOne({
      where: { 
        id: clientId,
        role: "CLIENT" 
      },
      transaction,
    });

    // User existence and role validation
    if (!existingUser) {
      await transaction.rollback();
      return next(new ErrorHandler("User doesn't exist or is not authorized", 404));
    }

    // Check if the user is associated with the campaign
    const isUserAssociated = await campaign.hasUser(existingUser, { transaction });

    // If not associated, return a response
    if (!isUserAssociated) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        message: "User is not associated with this campaign.",
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
        },
        campaign: {
          campaignID: campaign.campaignID,
          name: campaign.name,
        },
      });
    }

    // Remove the association between the user and the campaign
    await campaign.removeUser(existingUser, { transaction });

    // Commit transaction
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "User successfully removed from the campaign.",
      user: {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email
      },
      campaign: {
        campaignID: campaign.campaignID,
        name: campaign.name,
      },
    });

  } catch (error) {
    // Ensure transaction is rolled back
    if (transaction) {
      await transaction.rollback();
    }

    // Log the error for internal tracking
    console.error("Campaign Removal Error:", error);

    // Send generic error response
    return next(new ErrorHandler("An unexpected error occurred", 500));
  }
});

//----------------get all assigned campaign------------------------------------------
const getAllAssignedCampaign = asyncHandler(async (req, res, next) => {
  try {
    const { page = 0, size = 10 } = req.query;
    const { limit, offset } = getPagination(page, size);
    const userID = req.user.id;

    // Modify the condition to find campaigns associated with the user
    const campaigns = await Campaign.findAndCountAll({
      include: [
        {
          model: User,
          as: 'users',
          where: { id: userID }, // Filter campaigns by the current user
          through: { attributes: [] },
          attributes: ['id', 'email']  // Exclude junction table attributes if needed
        },
        {
          model: Layout,
          as: "layouts",
          order: [["createdAt", "ASC"]],
        }
      ],
      limit,
      offset,
      order: [["createdDate", "DESC"]],
      distinct: true // Important for accurate count with includes
    });

    // Update status for each campaign based on current time
    const updatedCampaigns = await Promise.all(
      campaigns.rows.map(async (campaign) => {
        const currentStatus = getCampaignStatus(
          campaign.timing.startDate,
          campaign.timing.endDate,
          campaign.timing.timeZone
        );

        // Update database if status has changed
        if (currentStatus !== campaign.campaignStatus) {
          await Campaign.update(
            { campaignStatus: currentStatus },
            { where: { campaignID: campaign.campaignID } }
          );
          campaign.campaignStatus = currentStatus;
        }

        return campaign;
      })
    );

    return res.status(200).json({
      success: true,
      totalItems: campaigns.count,
      campaigns: updatedCampaigns,
      currentPage: page ? +page : 0,
      totalPages: Math.ceil(campaigns.count / limit),
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

//-------------------get contact details-----------------------------------------------
const getContactDetails = asyncHandler(async (req, res, next) => {
  try {
    const id = req.user?.id;
    const campaignID = req.params?.campaignID;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // First, verify the user exists
    const user = await User.findByPk(id);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    // Find the campaign to ensure it exists
    const campaign = await Campaign.findByPk(campaignID);
    if (!campaign) {
      return next(new ErrorHandler("Campaign not found", 404));
    }

    // Find contacts with pagination
    const { count, rows: contacts } = await Contact.findAndCountAll({
      where: { campaignId: campaignID },
      limit: limit,
      offset: offset,
      order: [['createdAt', 'DESC']], // Optional: sort by creation date
    });

    // Calculate total pages
    const totalPages = Math.ceil(count / limit);

    // Return the contacts with pagination metadata
    res.status(200).json({
      success: true,
      totalContacts: count,
      totalPages: totalPages,
      currentPage: page,
      contactsPerPage: limit,
      contacts: contacts,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  adminSignup,
  adminSignin,
  updateBusinessUser,
  createClientLogin,
  assignCampaignToClient,
  removeCampaignFromClient,
  getAllAssignedCampaign,
  getContactDetails
  //   forgotPassword,
  //   resetPassword,
};
