const db = require("../../dbConfig/dbConfig.js");
const ErrorHandler = require("../../utils/ErrorHandler.js");
const asyncHandler = require("../../utils/asyncHandler.js");
const saasPlan = db.saasPlan;
const SubscriptionPlan = db.subscriptionPlan;

// Create and Save a new Product
const createSaasPlan = asyncHandler(async (req, res,next) => {
  const { name, description, features} = req.body;
    if (!name || !description || !features) {
        return next(new ErrorHandler("Please provide all required fields" , 400));
    }

  try {
    const existingSaasPlan = await saasPlan.findOne({
      where: { name: name },
    });
    if (existingSaasPlan) {
      return next(new ErrorHandler("Product already exist", 400));
    }
    const SaasPlanData = await saasPlan.create({
      name:name,
      description: description,
      features: features
    });
    return res.status(201).send({status:true,data:SaasPlanData});
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// find product with subscription plan
const findAllWithSubscriptionPlans = asyncHandler(async (req, res,next) => {
  const page = req.query.page ? parseInt(req.query.page, 10) : 0; // Default to page 0 if not provided
  const size = req.query.size ? parseInt(req.query.size, 10) : 10; // Default size is 10
  const offset = page * size;
  const limit = size;

  try {
    const data = await saasPlan.findAndCountAll({
      include: [
        {
          model: SubscriptionPlan,
          as: "subscriptionPlans", // Use the correct association alias
        },
      ],
      limit,
      offset,
      order: [["createdAt", "ASC"]],
      distinct: true, // Needed for correct total count when including a one-to-many relationship
    });

    if (!data) {
      return next(new ErrorHandler("No products found.", 404));
    }

    const response = {
      totalItems: data.count,
      products: data.rows,
      totalPages: Math.ceil(data.count / limit),
      currentPage: page,
    };

    return res.status(200).send({status:true,response});
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Retrieve all Products from the database (with pagination)
const findAllSaasPlan = asyncHandler( async (req, res,next) => {
  const { page, size } = req.query;
  const limit = size ? +size : 10; // default size
  const offset = page ? page * limit : 0;
  try {
    const data = await saasPlan.findAndCountAll({ limit, offset });
    if(!data) {
      return next(new ErrorHandler("No saasPlan found.", 404));
    };

   return res.status(200).send({
      totalItems: data.count,
      plans: data.rows,
      totalPages: Math.ceil(data.count / limit),
      currentPage: page ? +page : 0,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Find a single Product with an id
const findOnesaasPlan =asyncHandler( async (req, res,next) => {
  const id = req.params.id;

  try {
    const saasPlanData = await saasPlan.findByPk(id);
    if (saasPlanData) {
      return res.status(200).send({status:true,product});
    } else {
        return next(new ErrorHandler( `Cannot find Product with id=${id}.`,404 ));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Update a Product by the id in the request
const updateSaasPlan =asyncHandler( async (req, res,next) => {
  const id = req.params.id;

  try {
    const num = await saasPlan.update(req.body, { where: { id: id } });
    if (num == 1) {
     return res.status(200).send({status:true,
        message: "saas plan was updated successfully.",
      });
    } else {
        return next(new ErrorHandler( `Cannot update saas plan with id=${id}. Maybe saas plan was not found or req.body is empty!`,404 ));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

// Delete a Product with the specified id in the request
const deleteSaasPlan = asyncHandler(async (req, res) => {
  const id = req.params.id;
  try {
    const num = await saasPlan.destroy({ where: { id: id } });
    if (num == 1) {
      return res.status(200).send({
        message: "saas plan was deleted successfully!",
      });
    } else {
            return next(new ErrorHandler( `Cannot delete saas plan with id=${id}. Maybe saas plan was not found`,404 ));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = {
  createSaasPlan,
  findAllWithSubscriptionPlans,
  findAllSaasPlan,
  findOnesaasPlan,
  updateSaasPlan,
  deleteSaasPlan,
};