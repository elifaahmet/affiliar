const connectDB = require("../config/db");
const CategoryLimit = require("../models/CategoryLimit");
const OurCategory = require("../models/OurCategory");
const { logger } = require("../middlewares/logger");

const seed = async () => {
  try {
    await connectDB();
    // await CategoryLimit.deleteMany({}); // Uncomment to reset data

    const categories = await OurCategory.find({});
    const categoryLimits = categories.map((category) => {
      const categoryName = category.name.toLowerCase();
      let maxLimits = [];

      if (categoryName.includes("roulette")) {
        maxLimits = [
          { currency: "INR", amount: 5000 },
          { currency: "BDT", amount: 5000 },
          { currency: "HKD", amount: 5000 },
          { currency: "EUR", amount: 5 },
        ];
      } else if (categoryName.includes("blackjack")) {
        maxLimits = [
          { currency: "INR", amount: 10000 },
          { currency: "BDT", amount: 10000 },
          { currency: "HKD", amount: 10000 },
          { currency: "EUR", amount: 10 },
        ];
      } else if (categoryName.includes("baccarat")) {
        maxLimits = [
          { currency: "INR", amount: 10000 },
          { currency: "BDT", amount: 10000 },
          { currency: "HKD", amount: 10000 },
          { currency: "EUR", amount: 10 },
        ];
      } else if (categoryName.includes("slot")) {
        maxLimits = [
          { currency: "INR", amount: 200 },
          { currency: "BDT", amount: 200 },
          { currency: "HKD", amount: 200 },
          { currency: "EUR", amount: 2 },
        ];
      } else {
        // Default for all other categories
        maxLimits = [
          { currency: "INR", amount: 10000 },
          { currency: "BDT", amount: 10000 },
          { currency: "EUR", amount: 10 },
        ];
      }

      return {
        categoryId: category._id,
        maxLimits,
      };
    });

    await CategoryLimit.insertMany(categoryLimits);
    logger.info("seed.category_limits.success", {
      categories: categoryLimits.length,
    });
  } catch (error) {
    logger.error("seed.category_limits.failure", { error });
  }
};

// seed();
