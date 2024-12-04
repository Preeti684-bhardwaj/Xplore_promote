const db = require("../dbConfig/dbConfig.js");
const Contact = db.contacts;
const User=db.users;
const Campaign = db.campaigns;
const ErrorHandler = require("../utils/ErrorHandler.js");
const asyncHandler = require("../utils/asyncHandler.js");
const { Op } = require("sequelize");
const sequelize = db.sequelize;
const { phoneValidation } = require("../utils/phoneValidation.js");
const { isValidEmail, isValidLength } = require("../validators/validation.js");

// //----------contact us----------------------------
const contactUs = asyncHandler(async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      email,
      countryCode,
      phone,
      address,
      otherDetails,
      visitorId,
      deviceId,
      campaignID,
    } = req.body;

    // 1. Input Validation
    // Validate required fields existence
    const requiredFields = ["name", "email", "campaignID"];
    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      return next(
        new ErrorHandler(
          `Missing required fields: ${missingFields.join(", ")}`,
          400
        )
      );
    }
    if (!visitorId && !deviceId) {
      return next(
        new ErrorHandler("Either deviceId or visitorId is required", 400)
      );
    }

    // Check campaign existence
    const campaign = await Campaign.findByPk(campaignID, { transaction });
    if (!campaign) {
      await transaction.rollback();
      return next(new ErrorHandler("Campaign not found", 404));
    }

    // 2. Input Sanitization
    const sanitizedName = name.trim().replace(/\s+/g, " ");
    const sanitizedEmail = email.trim().toLowerCase();

    // Validate name
    const nameError = isValidLength(sanitizedName);
    if (nameError) {
      await transaction.rollback();
      return next(new ErrorHandler(nameError, 400));
    }

    // Validate email format
    if (!isValidEmail(sanitizedEmail)) {
      await transaction.rollback();
      return next(new ErrorHandler("Invalid email", 400));
    }

    // Validate phone if both country code and phone are provided
    let cleanedPhone = null;
    let cleanedCountryCode = null;

    if (phone || countryCode) {
      // If one is provided, both must be provided
      if (!phone || !countryCode) {
        await transaction.rollback();
        return next(
          new ErrorHandler(
            "Both country code and phone number are required",
            400
          )
        );
      }

      const phoneValidationResult = phoneValidation.validatePhone(
        countryCode,
        phone
      );

      if (!phoneValidationResult.isValid) {
        await transaction.rollback();
        return next(new ErrorHandler(phoneValidationResult.message, 400));
      }

      cleanedPhone = phoneValidationResult.cleanedPhone;
      cleanedCountryCode = phoneValidationResult.cleanedCode;
    }

    // Prepare contact data
    const contactData = {
      name: sanitizedName,
      email: sanitizedEmail,
      countryCode: cleanedCountryCode,
      phone: cleanedPhone,
      address,
      otherDetails,
      visitorIds: visitorId ? [visitorId] : [],
      deviceId: deviceId ? [deviceId] : [],
      campaignId: campaignID,
    };

    // Check for existing contacts
    const existingContacts = await Contact.findAll({
      where: {
        [Op.or]: [
          ...(visitorId
            ? [{ visitorIds: { [Op.contains]: [visitorId] } }]
            : []),
          ...(deviceId ? [{ deviceId: { [Op.contains]: [deviceId] } }] : []),
        ],
      },
      transaction,
    });

    let userData;
    let isNew = true;

    // Check for contacts with exact email match
    const contactWithSameEmail = existingContacts.find(
      (contact) => contact.email === sanitizedEmail
    );

    if (contactWithSameEmail) {
      if (contactWithSameEmail.campaignId === campaignID) {
        // Update existing contact for the same email and campaign
        await contactWithSameEmail.update(
          {
            name: sanitizedName,
            countryCode: cleanedCountryCode,
            phone: cleanedPhone,
            address,
            otherDetails,
            visitorIds: [
              ...new Set([
                ...contactWithSameEmail.visitorIds,
                ...contactData.visitorIds,
              ]),
            ],
            deviceId: [
              ...new Set([
                ...contactWithSameEmail.deviceId,
                ...contactData.deviceId,
              ]),
            ],
          },
          { transaction }
        );

        userData = contactWithSameEmail;
        isNew = false;
      } else {
        // Check if there is already a contact with the same email and campaign
        const existingContactForCampaign = await Contact.findOne({
          where: { email: sanitizedEmail, campaignId: campaignID },
          transaction,
        });

        if (existingContactForCampaign) {
          // Update the existing contact for this campaign
          await existingContactForCampaign.update(
            {
              name: sanitizedName,
              countryCode: cleanedCountryCode,
              phone: cleanedPhone,
              address,
              otherDetails,
              visitorIds: [
                ...new Set([
                  ...existingContactForCampaign.visitorIds,
                  ...contactData.visitorIds,
                ]),
              ],
              deviceId: [
                ...new Set([
                  ...existingContactForCampaign.deviceId,
                  ...contactData.deviceId,
                ]),
              ],
            },
            { transaction }
          );

          userData = existingContactForCampaign;
          isNew = false;
        } else {
          // Create a new contact for the different campaign
          userData = await Contact.create(contactData, { transaction });
        }
      }
    } else {
      // Check if contacts exist with same visitor/device ID but different email
      const contactsWithSameIdentifiers = existingContacts.filter(
        (contact) => contact.email !== sanitizedEmail
      );

      if (contactsWithSameIdentifiers.length > 0) {
        // If contacts exist with same identifiers but different email, create a new contact
        userData = await Contact.create(contactData, { transaction });
      } else {
        // No existing contacts, create new
        userData = await Contact.create(contactData, { transaction });
      }
    }

    // Commit transaction
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: isNew
        ? "New Contact Us Form Submitted successfully"
        : "Contact Us Form updated/submitted successfully",
      data: userData,
    });
  } catch (error) {
    // Rollback transaction in case of error
    await transaction.rollback();
    return next(new ErrorHandler(error.message, 500));
  }
});

// // ----isInterestedProducts--------------------------------
const updateInterestedProduct = async (req, res, next) => {
    const transaction = await sequelize.transaction();
  
    try {
      const { visitorId, email, deviceId, productName, campaignID } = req.body;
  
      // Validate required inputs
      if (!visitorId && !deviceId && !email) {
        return next(
          new ErrorHandler("Either deviceId, visitorId, or email is required", 400)
        );
      }
  
      if (!productName) {
        return next(new ErrorHandler("Product name is required", 400));
      }
  
      if (!campaignID) {
        return next(new ErrorHandler("Campaign ID is required", 400));
      }
  
      // Check if campaign exists
      const campaign = await Campaign.findByPk(campaignID, { transaction });
      if (!campaign) {
        await transaction.rollback();
        return next(new ErrorHandler("Campaign not found", 404));
      }
  
      // Build the query conditions
      const whereConditions = [];
  
      // Add conditions based on available identifiers
      if (visitorId) {
        whereConditions.push({ visitorIds: { [Op.contains]: [visitorId] } });
      }
      if (deviceId) {
        whereConditions.push({ deviceId: { [Op.contains]: [deviceId] } });
      }
      if (email) {
        whereConditions.push({ email: email.toLowerCase().trim() });
      }
  
      // Find all contacts matching the conditions for this campaign
      const contacts = await Contact.findAll({
        where: {
          [Op.and]: [
            { 
              [Op.or]: whereConditions 
            },
            { campaignId: campaignID }
          ]
        },
        transaction,
      });
  
      // If no contacts exist, create a new one
      if (contacts.length === 0) {
        const newContact = await Contact.create({
          name: null,
          email: email ? email.toLowerCase().trim() : null,
          visitorIds: visitorId ? [visitorId] : [],
          deviceId: deviceId ? [deviceId] : [],
          campaignId: campaignID,
          isInterestedProducts: [productName],
        }, { transaction });
  
        await transaction.commit();
        return res.status(200).json({
          success: true,
          message: "New contact created with product interest",
          data: {
            isInterestedProducts: newContact.isInterestedProducts,
          },
        });
      }
  
      // Track if any updates were made
      let updatedContacts = [];
  
      // Process each existing contact
      for (const contact of contacts) {
        let currentProducts = contact.isInterestedProducts || [];
  
        // Check if product name already exists
        if (currentProducts.includes(productName)) {
          continue; // Skip this contact if product is already in the list
        }
  
        // Update the array with the new product name
        const updatedProducts = [...currentProducts, productName];
  
        // Prepare update object
        const updateData = {
          isInterestedProducts: updatedProducts,
        };
  
        // Add visitorId if not exists
        if (visitorId && !contact.visitorIds.includes(visitorId)) {
          updateData.visitorIds = [...new Set([...contact.visitorIds, visitorId])];
        }
  
        // Add deviceId if not exists
        if (deviceId && !contact.deviceId.includes(deviceId)) {
          updateData.deviceId = [...new Set([...contact.deviceId, deviceId])];
        }
  
        // Add email if not exists and provided
        if (email && !contact.email) {
          updateData.email = email.toLowerCase().trim();
        }
  
        // Update the contact record
        const updatedContact = await contact.update(updateData, { transaction });
        updatedContacts.push(updatedContact);
      }
  
      // Commit transaction
      await transaction.commit();
  
      return res.status(200).json({
        success: true,
        message: updatedContacts.length > 0 
          ? "Product interest updated for existing contacts" 
          : "Product interest already exists for all contacts",
        data: {
          updatedContactsCount: updatedContacts.length,
          isInterestedProducts: updatedContacts.length > 0 
            ? updatedContacts[0].isInterestedProducts 
            : null,
        },
      });
    } catch (error) {
      // Rollback transaction in case of error
      await transaction.rollback();
      console.error("Error updating product interest:", error);
      return next(new ErrorHandler(error.message, 500));
    }
  };

  const getContactDetails = asyncHandler(async (req, res, next) => {
    try {
      const id = req.user?.id ||req.headers["userid"];
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
      if(campaign.createdBy!==id){
        return next(new ErrorHandler("Unauthorized to access the resource",401));
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
  

module.exports = { contactUs, updateInterestedProduct,getContactDetails };
