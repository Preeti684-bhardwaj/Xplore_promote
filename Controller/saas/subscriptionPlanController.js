const db = require("../../dbConfig/dbConfig.js");
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");
const saasPlan = db.saasPlan;
const SubscriptionPlan = db.subscriptionPlan;
const { validationResult } = require("express-validator");


// Create and Save a new Subscription Plan with Transaction
const createSubscriptionPlan = asyncHandler(async (req, res,next) => {
  const { frequency, price, saasPlanId } = req.body;
  // const existingPlanFrequency = await SubscriptionPlan.findOne({
  //   where: { frequency: frequency},
  // });
  // if (existingPlanFrequency) {
  //   return next(new errorHandler("frequency already exist", 400));
  // }

  if (!frequency || !price || !saasPlanId) {
    return next(new ErrorHandler("Please provide all required fields", 400));
  }
  const transaction = await db.sequelize.transaction();

  try {
    // Ensure the Product exists
    const plan= await saasPlan.findByPk(saasPlanId);
    if (!plan) {
      await transaction.rollback();
      return next(new ErrorHandler("saas plan not found", 404));
    }

    const subscriptionPlan = await SubscriptionPlan.create(
      {
        frequency,
        price,
        saasPlanId,
      },
      { transaction }
    );

    await transaction.commit();
    return res.status(201).send({status:true,subscriptionPlan});
  } catch (error) {
    await transaction.rollback();
   return next(new ErrorHandler(error.message, 500));
  }
});

// Retrieve all Subscription Plans from the database (with pagination)
const subsFindAll =asyncHandler( async (req, res,next) => {
  const { page, size, saasPlanId } = req.query;
  const condition = saasPlanId ? { saasPlanId: saasPlanId } : null;
  const limit = size ? +size : 14; // default size
  const offset = page ? page * limit : 0;

  try {
    const data = await SubscriptionPlan.findAndCountAll({
      where: condition,
      limit,
      offset,
    });
    if (!data) {
      return next(new ErrorHandler("No subscription plans found.", 404));
    }
    res.status(200).send({
      status:true,
      totalItems: data.count,
      subscriptionPlans: data.rows,
      totalPages: Math.ceil(data.count / limit),
      currentPage: page ? +page : 0,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});
// find subsplan through frequency
const FindByFrequency =asyncHandler( async (req, res,next) => {
  const { frequency } = req.query; // Extract frequency from request body

  try {
    const subscriptionPlans = await SubscriptionPlan.findAll({
      where: {
        frequency: frequency,
      },
      include: [
        {
          model: db.saasPlan,
          as: "saasPlan", // Use the correct association alias
        },
      ],
    });

    if (subscriptionPlans.length > 0) {
     return res.status(200).send({status:true,subscriptionPlans});
    } else {
      return next(new ErrorHandler(`Cannot find any Subscription Plan with frequency=${frequency}.`, 404));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Find a single Subscription Plan with an id
const subsFindOne = asyncHandler(async (req, res,next) => {
  const id = req.params.id;

  try {
    const subscriptionPlan = await SubscriptionPlan.findByPk(id);
    if (subscriptionPlan) {
      return res.status(200).send({status:true,data:subscriptionPlan});
    } else {
      return next(new ErrorHandler( `Cannot find Subscription Plan with id=${id}.`,404 ));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete a Subscription Plan with the specified id in the request
const deletePlanById =asyncHandler( async (req, res) => {
  const id = req.params.id;

  try {
    const num = await SubscriptionPlan.destroy({ where: { id: id } });
    if (num == 1) {
      return res.status(200).send({
        status:true,
        message: "Subscription Plan was deleted successfully!",
      });
    } else {
     return next(new ErrorHandler(`Cannot delete Subscription Plan with id=${id}. Maybe Subscription Plan was not found!`,400 ));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  createSubscriptionPlan,
  FindByFrequency,
  subsFindAll,
  subsFindOne,
  deletePlanById,
};