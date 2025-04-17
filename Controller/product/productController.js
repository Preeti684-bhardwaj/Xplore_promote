const db = require("../../dbConfig/dbConfig");
const { uploadFiles } = require("../../utils/cdnImplementation");
const Product = db.Product;
const ProductVariant = db.ProductVariant;
const Collection = db.Collection;
const Tag = db.Tag;
const Inventory = db.Inventory;
const InventoryLocation = db.InventoryLocation;
const upload = require("../../middleware/multer");

// Create a single product (manual creation)
exports.createProduct = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    // Extract basic product info
    const {
      name,
      description,
      type,
      vendor,
      status,
      seo_title,
      seo_description,
      collections,
      tags,
      variants,
    } = req.body;

    // Validate required fields
    if (!name) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    // Upload images if present (using multer middleware)
    let productImages = [];
    if (req.files && req.files.length > 0) {
      const uploadedImages = await uploadFiles(req.files);
      productImages = uploadedImages;
    }

    // Create product record
    const newProduct = await Product.create(
      {
        name,
        description,
        type,
        vendor,
        status: status || "draft",
        seo_title,
        seo_description,
        images: productImages,
      },
      { transaction }
    );

    // Process collections if provided
    if (!collections || collections.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "At least one collection ID must be provided",
      });
    }

    const collectionsArray =
      typeof collections === "string" ? JSON.parse(collections) : collections;

    const foundCollections = await Collection.findAll({
      where: {
        id: collectionsArray,
        user_id: req.user.id,
      },
    });

    if (foundCollections.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "No valid collections found for the provided IDs",
      });
    }

    await newProduct.addCollections(foundCollections, { transaction });

    // Process tags if provided
    if (tags && tags.length > 0) {
      // Parse tags if they came as a string
      const tagsArray = typeof tags === "string" ? JSON.parse(tags) : tags;

      // For each tag, find or create
      for (const tagName of tagsArray) {
        const [tag] = await Tag.findOrCreate({
          where: { name: tagName },
          transaction,
        });

        await newProduct.addTag(tag, { transaction });
      }
    }

    // Process variants if provided
    if (variants && variants.length > 0) {
      // Parse variants if they came as a string
      const variantsArray =
        typeof variants === "string" ? JSON.parse(variants) : variants;

      // Create each variant
      for (const variantData of variantsArray) {
        // Validate required variant fields
        if (!variantData.price) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: "Price is required for all variants",
          });
        }

        const newVariant = await ProductVariant.create(
          {
            product_id: newProduct.id,
            price: variantData.price,
            compare_at_price: variantData.compare_at_price,
            barcode: variantData.barcode,
            weight: variantData.weight,
            weight_unit: variantData.weight_unit,
            requires_shipping: variantData.requires_shipping,
            is_taxable: variantData.is_taxable,
            is_active:
              variantData.is_active !== undefined
                ? variantData.is_active
                : true,
            images: variantData.images || [],
          },
          { transaction }
        );

        // If inventory is provided for this variant
        if (variantData.inventory && variantData.inventory.length > 0) {
          for (const invData of variantData.inventory) {
            // Check if location exists
            // Expect invData.location to be { name, address, is_active }
            if (!invData.location || !invData.location.name) {
              await transaction.rollback();
              return res.status(400).json({
                success: false,
                message: "Location name is required in inventory data",
              });
            }

            // Create new location record
            const location = await InventoryLocation.create(
              {
                name: invData.location.name,
                address: invData.location.address,
                pincode: invData.location.pincode,
                is_active:
                  invData.location.is_active !== undefined
                    ? invData.location.is_active
                    : true,
              },
              { transaction }
            );

            // Create inventory record
            await Inventory.create(
                {
                  variant_id: newVariant.id,
                  location_id: location.id,
                  quantity: invData.quantity || 0,
                },
                { transaction }
              );
          }
        }
      }
    }

    await transaction.commit();

    // Fetch the complete product with all associations for the response
    const completeProduct = await Product.findByPk(newProduct.id, {
      include: [
        { model: Collection, attributes: ["id", "name"], through: { attributes: [] }, },
        { model: Tag, through: { attributes: [] } },
        {
          model: ProductVariant,
          include: [{ model: Inventory, include: [InventoryLocation] }],
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: completeProduct,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating product:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create product",
      error: error.message,
    });
  }
};

// Bulk create products
exports.bulkCreateProducts = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Products array is required",
      });
    }

    const createdProducts = [];

    // Process each product in the array
    for (const productData of products) {
      // Validate required fields
      if (!productData.name) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Product name is required for all products",
        });
      }

      // Create product record
      const newProduct = await Product.create(
        {
          name: productData.name,
          description: productData.description,
          type: productData.type,
          vendor: productData.vendor,
          status: productData.status || "draft",
          seo_title: productData.seo_title,
          seo_description: productData.seo_description,
          images: productData.images || [],
        },
        { transaction }
      );

      // Process collections if provided
      if (productData.collections && productData.collections.length > 0) {
        const foundCollections = await Collection.findAll({
          where: {
            id: productData.collections,
            user_id: req.user.id,
          },
        });

        if (foundCollections.length > 0) {
          await newProduct.addCollections(foundCollections, { transaction });
        }
      }

      // Process tags if provided
      if (productData.tags && productData.tags.length > 0) {
        for (const tagName of productData.tags) {
          const [tag] = await Tag.findOrCreate({
            where: { name: tagName },
            transaction,
          });

          await newProduct.addTag(tag, { transaction });
        }
      }

      // Process variants if provided
      if (productData.variants && productData.variants.length > 0) {
        for (const variantData of productData.variants) {
          // Validate required variant fields
          if (!variantData.price) {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              message: `Price is required for all variants in product: ${productData.name}`,
            });
          }

          const newVariant = await ProductVariant.create(
            {
              product_id: newProduct.id,
              price: variantData.price,
              compare_at_price: variantData.compare_at_price,
              barcode: variantData.barcode,
              weight: variantData.weight,
              weight_unit: variantData.weight_unit,
              requires_shipping: variantData.requires_shipping,
              is_taxable: variantData.is_taxable,
              is_active:
                variantData.is_active !== undefined
                  ? variantData.is_active
                  : true,
              images: variantData.images || [],
            },
            { transaction }
          );

          // If inventory is provided for this variant
          if (variantData.inventory && variantData.inventory.length > 0) {
            for (const invData of variantData.inventory) {
              // Check if location exists
              const location = await InventoryLocation.findByPk(
                invData.location_id,
                { transaction }
              );

              if (!location) {
                await transaction.rollback();
                return res.status(400).json({
                  success: false,
                  message: `Inventory location with ID ${invData.location_id} not found`,
                });
              }

              // Create inventory record
              await Inventory.create(
                {
                  variant_id: newVariant.id,
                  location_id: invData.location_id,
                  quantity: invData.quantity || 0,
                },
                { transaction }
              );
            }
          }
        }
      }

      // Add created product to array
      createdProducts.push(newProduct.id);
    }

    await transaction.commit();

    // Fetch all created products with associations
    const completeProducts = await Product.findAll({
      where: { id: createdProducts },
      include: [
        { model: Collection, through: { attributes: [] } },
        { model: Tag, through: { attributes: [] } },
        {
          model: ProductVariant,
          include: [{ model: Inventory, include: [InventoryLocation] }],
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: `${createdProducts.length} products created successfully`,
      data: completeProducts,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error bulk creating products:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to bulk create products",
      error: error.message,
    });
  }
};

// Get all products
exports.getAllProducts = async (req, res) => {
  try {
    // Extract query parameters for filtering
    const {
      status,
      collection_id,
      tag,
      search,
      limit = 20,
      offset = 0,
    } = req.query;

    // Build query conditions
    const where = {};

    // Filter by status if provided
    if (status) {
      where.status = status;
    }

    // Search by name or description
    if (search) {
      where[db.Sequelize.Op.or] = [
        { name: { [db.Sequelize.Op.iLike]: `%${search}%` } },
        { description: { [db.Sequelize.Op.iLike]: `%${search}%` } },
      ];
    }

    // Include options for associations
    const include = [
      { model: ProductVariant, include: [Inventory] },
      { model: Tag, through: { attributes: [] } },
      { model: Collection, through: { attributes: [] } },
    ];

    // Filter by collection if provided
    if (collection_id) {
      include.find((inc) => inc.model === Collection).where = {
        id: collection_id,
      };
    }

    // Filter by tag if provided
    if (tag) {
      include.find((inc) => inc.model === Tag).where = { name: tag };
    }

    // Query with pagination
    const { count, rows: products } = await Product.findAndCountAll({
      where,
      include,
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true, // Needed for accurate count with associations
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      message: "Products retrieved successfully",
      data: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        products,
      },
    });
  } catch (error) {
    console.error("Error retrieving products:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve products",
      error: error.message,
    });
  }
};

// Get a single product by ID
exports.getOneProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findByPk(productId, {
      include: [
        { model: Collection, through: { attributes: [] } },
        { model: Tag, through: { attributes: [] } },
        {
          model: ProductVariant,
          include: [{ model: Inventory, include: [InventoryLocation] }],
        },
      ],
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product retrieved successfully",
      data: product,
    });
  } catch (error) {
    console.error("Error retrieving product:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve product",
      error: error.message,
    });
  }
};

// Update a product
exports.updateProduct = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const productId = req.params.id;

    // Find product to update
    const product = await Product.findByPk(productId);

    if (!product) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Extract update data
    const {
      name,
      description,
      type,
      vendor,
      status,
      seo_title,
      seo_description,
      collections,
      tags,
    } = req.body;

    // Upload new images if provided
    let productImages = product.images || [];
    if (req.files && req.files.length > 0) {
      const uploadedImages = await uploadFiles(req.files);

      // If replace_images flag is set, replace all images
      if (req.body.replace_images === "true") {
        productImages = uploadedImages;
      } else {
        // Otherwise, append new images
        productImages = [...productImages, ...uploadedImages];
      }
    }

    // Update product record
    await product.update(
      {
        name: name || product.name,
        description:
          description !== undefined ? description : product.description,
        type: type !== undefined ? type : product.type,
        vendor: vendor !== undefined ? vendor : product.vendor,
        status: status || product.status,
        seo_title: seo_title !== undefined ? seo_title : product.seo_title,
        seo_description:
          seo_description !== undefined
            ? seo_description
            : product.seo_description,
        images: productImages,
      },
      { transaction }
    );

    // Update collections if provided
    if (collections) {
      // Parse collections if they came as a string
      const collectionsArray =
        typeof collections === "string" ? JSON.parse(collections) : collections;

      // Find all specified collections
      const foundCollections = await Collection.findAll({
        where: {
          id: collectionsArray,
          user_id: req.user.id,
        },
      });

      // Replace all collection associations
      await product.setCollections(foundCollections, { transaction });
    }

    // Update tags if provided
    if (tags) {
      // Parse tags if they came as a string
      const tagsArray = typeof tags === "string" ? JSON.parse(tags) : tags;
      const tagObjects = [];

      // For each tag, find or create
      for (const tagName of tagsArray) {
        const [tag] = await Tag.findOrCreate({
          where: { name: tagName },
          transaction,
        });

        tagObjects.push(tag);
      }

      // Replace all tag associations
      await product.setTags(tagObjects, { transaction });
    }

    await transaction.commit();

    // Fetch the updated product with all associations
    const updatedProduct = await Product.findByPk(productId, {
      include: [
        { model: Collection, through: { attributes: [] } },
        { model: Tag, through: { attributes: [] } },
        {
          model: ProductVariant,
          include: [{ model: Inventory, include: [InventoryLocation] }],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating product:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update product",
      error: error.message,
    });
  }
};

// Bulk update products
exports.bulkUpdateProducts = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Products array is required",
      });
    }

    const updatedProducts = [];

    // Process each product in the array
    for (const productData of products) {
      // Validate product ID
      if (!productData.id) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Product ID is required for all products in bulk update",
        });
      }

      // Find product to update
      const product = await Product.findByPk(productData.id);

      if (!product) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Product with ID ${productData.id} not found`,
        });
      }

      // Update product record
      await product.update(
        {
          name: productData.name || product.name,
          description:
            productData.description !== undefined
              ? productData.description
              : product.description,
          type:
            productData.type !== undefined ? productData.type : product.type,
          vendor:
            productData.vendor !== undefined
              ? productData.vendor
              : product.vendor,
          status: productData.status || product.status,
          seo_title:
            productData.seo_title !== undefined
              ? productData.seo_title
              : product.seo_title,
          seo_description:
            productData.seo_description !== undefined
              ? productData.seo_description
              : product.seo_description,
          images: productData.images || product.images,
        },
        { transaction }
      );

      // Update collections if provided
      if (productData.collections) {
        const foundCollections = await Collection.findAll({
          where: {
            id: productData.collections,
            user_id: req.user.id,
          },
        });

        await product.setCollections(foundCollections, { transaction });
      }

      // Update tags if provided
      if (productData.tags) {
        const tagObjects = [];

        for (const tagName of productData.tags) {
          const [tag] = await Tag.findOrCreate({
            where: { name: tagName },
            transaction,
          });

          tagObjects.push(tag);
        }

        await product.setTags(tagObjects, { transaction });
      }

      // Process variants if provided
      if (productData.variants && productData.variants.length > 0) {
        for (const variantData of productData.variants) {
          if (variantData.id) {
            // Update existing variant
            const variant = await ProductVariant.findOne({
              where: {
                id: variantData.id,
                product_id: product.id,
              },
            });

            if (variant) {
              await variant.update(
                {
                  price: variantData.price || variant.price,
                  compare_at_price:
                    variantData.compare_at_price !== undefined
                      ? variantData.compare_at_price
                      : variant.compare_at_price,
                  barcode:
                    variantData.barcode !== undefined
                      ? variantData.barcode
                      : variant.barcode,
                  weight:
                    variantData.weight !== undefined
                      ? variantData.weight
                      : variant.weight,
                  weight_unit: variantData.weight_unit || variant.weight_unit,
                  requires_shipping:
                    variantData.requires_shipping !== undefined
                      ? variantData.requires_shipping
                      : variant.requires_shipping,
                  is_taxable:
                    variantData.is_taxable !== undefined
                      ? variantData.is_taxable
                      : variant.is_taxable,
                  is_active:
                    variantData.is_active !== undefined
                      ? variantData.is_active
                      : variant.is_active,
                  images: variantData.images || variant.images,
                },
                { transaction }
              );

              // Update inventory if provided
              if (variantData.inventory && variantData.inventory.length > 0) {
                for (const invData of variantData.inventory) {
                  // Check if inventory entry exists
                  const inventory = await Inventory.findOne({
                    where: {
                      variant_id: variant.id,
                      location_id: invData.location_id,
                    },
                  });

                  if (inventory) {
                    // Update existing inventory
                    await inventory.update(
                      {
                        quantity: invData.quantity,
                      },
                      { transaction }
                    );
                  } else {
                    // Create new inventory entry
                    await Inventory.create(
                      {
                        variant_id: variant.id,
                        location_id: invData.location_id,
                        quantity: invData.quantity || 0,
                      },
                      { transaction }
                    );
                  }
                }
              }
            }
          } else {
            // Create new variant
            // Validate required variant fields
            if (!variantData.price) {
              await transaction.rollback();
              return res.status(400).json({
                success: false,
                message: `Price is required for new variants in product: ${product.name}`,
              });
            }

            const newVariant = await ProductVariant.create(
              {
                product_id: product.id,
                price: variantData.price,
                compare_at_price: variantData.compare_at_price,
                barcode: variantData.barcode,
                weight: variantData.weight,
                weight_unit: variantData.weight_unit,
                requires_shipping: variantData.requires_shipping,
                is_taxable: variantData.is_taxable,
                is_active:
                  variantData.is_active !== undefined
                    ? variantData.is_active
                    : true,
                images: variantData.images || [],
              },
              { transaction }
            );

            // If inventory is provided for this variant
            if (variantData.inventory && variantData.inventory.length > 0) {
              for (const invData of variantData.inventory) {
                await Inventory.create(
                  {
                    variant_id: newVariant.id,
                    location_id: invData.location_id,
                    quantity: invData.quantity || 0,
                  },
                  { transaction }
                );
              }
            }
          }
        }
      }

      updatedProducts.push(product.id);
    }

    await transaction.commit();

    // Fetch all updated products
    const completedProducts = await Product.findAll({
      where: { id: updatedProducts },
      include: [
        { model: Collection, through: { attributes: [] } },

        { model: Tag, through: { attributes: [] } },
        {
          model: ProductVariant,
          include: [{ model: Inventory, include: [InventoryLocation] }],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      message: `${updatedProducts.length} products updated successfully`,
      data: completedProducts,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error bulk updating products:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to bulk update products",
      error: error.message,
    });
  }
};

// Delete a product
exports.deleteProduct = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const productId = req.params.id;

    // Find product to delete
    const product = await Product.findByPk(productId);

    if (!product) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Delete product and associated data (variants, inventory, etc.)
    await product.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting product:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
      error: error.message,
    });
  }
};
