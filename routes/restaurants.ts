import express, { type Request } from "express";
import { validate } from "../middlewares/validate.js";
import { RestaurantSchema, type Restaurant } from "../schemas/restaurant.js";
import { initializeRedisClient } from "../utils/client.js";
import { nanoid } from "nanoid";
import { restaurantKeyById } from "../utils/keys.js";
import { successResponse } from "../utils/responses.js";
const router = express.Router();

router.post("/", validate(RestaurantSchema), async (req, res, next) => {
  const data: Restaurant = req.body;
  try {
    const client = await initializeRedisClient();
    const id = nanoid();
    const restaurantKey = restaurantKeyById(id);

    const hashData = { id, name: data.name, location: data.location };
    const addResult = await client.hSet(restaurantKey, hashData);
    console.log(addResult);
    successResponse(res, hashData, "Restaurant added successfully");
  } catch (error) {
    next(error);
  }
});

router.get(
  "/:restaurantId",
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    try {
      const client = await initializeRedisClient();
      const restaurantKey = restaurantKeyById(restaurantId);

      const restaurant = await client.hGetAll(restaurantKey);
      successResponse(res, restaurant, "Restaurant found");
    } catch (error) {
      next(error);
    }
  }
);

export default router;
