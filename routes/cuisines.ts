import express, { type Request } from "express";
import { initializeRedisClient } from "../utils/client.js";
import {
  cuisinesKey,
  cuisinesKeyById,
  restaurantKeyById,
} from "../utils/keys.js";
import { successResponse } from "../utils/responses.js";
const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const client = await initializeRedisClient();
    const cuisines = await client.sMembers(cuisinesKey);
    successResponse(res, cuisines, "Cuisines fetched successfully");
  } catch (error) {
    next(error);
  }
});

router.get(
  "/:cuisineId",
  async (req: Request<{ cuisineId: string }>, res, next) => {
    const { cuisineId } = req.params;
    try {
      const client = await initializeRedisClient();
      const restaurantIds = await client.sMembers(cuisinesKeyById(cuisineId));
      const restaurants = await Promise.all(
        restaurantIds.map((id) => client.hGet(restaurantKeyById(id), "name"))
      );
      successResponse(res, restaurants, "Restaurants fetched successfully");
    } catch (error) {
      next(error);
    }
  }
);
export default router;
