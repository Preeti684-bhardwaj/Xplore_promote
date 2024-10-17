const db = require("../dbConfig/dbConfig.js");
const Advertisement =db.advertisements;
const { Op } = require("sequelize");

// Pagination helper function
const getPagination = (page, size) => {
    const limit = size ? +size : 10;
    const offset = page ? page * limit : 0;
    return { limit, offset };
  };

const createAdvertisement = async (req, res) => {
  try {
    const campaignID=req.params.campaignId
        // Destructure required fields from request body
        const { name} =
          req.body;
    
        // Validate required fields
        if (!name) {
          return res.status(400).json({
            message:
              "Missing required fields. Name are mandatory.",
          });
        }
        if(!campaignID){
            return res.status(400).json({
                message:
                  "Missing campaignId",
              });
        }
    
        // Validate data types
        if (
          typeof name !== "string") {
          return res
            .status(400)
            .json({ message: "Invalid data types for required fields." });
        }
    
        // Prepare campaign data
        const advertisementData = {
          name,
          campaignID:campaignID
        };
    
        // Create campaign
        const advertisement= await Advertisement.create(advertisementData);
    
        res.status(201).json({status:true,data:advertisement});
      } catch (error) {
        console.error("Error creating campaign:", error);
    
        if (error instanceof ValidationError) {
          // Handle Sequelize validation errors
          return res.status(400).json({
            message: "Validation error",
            errors: error.errors.map((e) => ({
              field: e.path,
              message: e.message,
            })),
          });
        }
    
        // Handle other types of errors
        res
          .status(500)
          .json({ message: "Failed to create campaign", error: error.message });
      }
    };
// Get all advertisements with pagination
const getAllAdvertisement = async (req, res) => {
  const { page, size, name } = req.query;
  const { limit, offset } = getPagination(page, size);
  const condition = name ? { name: { [Op.iLike]: `%${name}%` } } : null;

  try {
    const data = await Advertisement.findAndCountAll({
      where: condition,
      limit,
      offset,
      include: [
        { model: db.campaigns, as: "campaign" },
        { model: db.layouts, as: "layouts" },
      ],
    });

    res.json({
      totalItems: data.count,
      advertisements: data.rows,
      currentPage: page ? +page : 0,
      totalPages: Math.ceil(data.count / limit),
    });
  } catch (error) {
    console.error("Error fetching advertisements:", error);
    res
      .status(500)
      .json({ message: "Error fetching advertisements", error: error.message });
  }
};

// Get a single advertisement by ID
const getOneAdvertisement = async (req, res) => {
  try {
    const advertisement = await Advertisement.findByPk(req.params.id, {
      include: [
        { model: db.campaigns, as: "campaign" },
        { model: db.layouts, as: "layouts" },
      ],
    });
    if (advertisement) {
      res.json(advertisement);
    } else {
      res.status(404).json({ message: "Advertisement not found" });
    }
  } catch (error) {
    console.error("Error fetching advertisement:", error);
    res
      .status(500)
      .json({ message: "Error fetching advertisement", error: error.message });
  }
};

// Update an advertisement
const updateAdvertisement = async (req, res) => {
  try {
    const [updated] = await Advertisement.update(req.body, {
      where: { advertisementID: req.params.id },
    });
    if (updated) {
      const updatedAdvertisement = await Advertisement.findByPk(req.params.id);
      res.json({ status:false,message:"Advertisement updated successfully",data: updatedAdvertisement});
    } else {
      res.status(404).json({ status:false,message: "Advertisement not found" });
    }
  } catch (error) {
    console.error("Error updating advertisement:", error);
    res
      .status(500)
      .json({
        status:false,
        message: "Failed to update advertisement",
        error: error.message,
      });
  }
};

// Delete an advertisement
const deleteAdvertisement = async (req, res) => {
  try {
    const deleted = await Advertisement.destroy({
      where: { advertisementID: req.params.id },
    });
    if (deleted) {
        res.status(200).json({status:true,message:"Advertisement Deleted Successfully"})
    } else {
      res.status(404).json({ status:false,message: "Advertisement not found" });
    }
  } catch (error) {
    console.error("Error deleting advertisement:", error);
    res
      .status(500)
      .json({
        status:false,
        message: "Failed to delete advertisement",
        error: error.message,
      });
  }
};
module.exports = {
  createAdvertisement,
  getAllAdvertisement,
  getOneAdvertisement,
  updateAdvertisement,
  deleteAdvertisement,
};
