import express, { type Request } from "express";
import { validate } from "../middlewares/validate.js";
import { RestaurantSchema, type Restaurant } from "../schemas/restaurant.js";
import { initializeRedisClient } from "../utils/client.js";
import { nanoid } from "nanoid";
import {
  cuisinesKey,
  cuisinesKeyById,
  restaurantCuisineKeyById,
  restaurantKeyById,
  restaurantsByRatingKey,
  reviewDetailsKeyById,
  reviewKeyById,
} from "../utils/keys.js";
import { errorResponse, successResponse } from "../utils/responses.js";
import { checkRestaurantExists } from "../middlewares/checkRestaurantId.js";
import { ReviewSchema, type Review } from "../schemas/review.js";
const router = express.Router();

router.get("/", async (req, res, next) => {
  const { page = 1, pageSize = 10 } = req.query;
  const start = (Number(page) - 1) * Number(pageSize);
  const end = start + Number(pageSize) - 1;
  try {
    const client = await initializeRedisClient();
    const restarauntIds = await client.zRange(
      restaurantsByRatingKey,
      start,
      end,
      {
        REV: true,
      }
    );
    const restaurants = await Promise.all(
      restarauntIds.map((id) => client.hGetAll(restaurantKeyById(id)))
    );
    successResponse(res, restaurants, "Restaurants found");
  } catch (error) {
    next(error);
  }
});

router.post("/", validate(RestaurantSchema), async (req, res, next) => {
  const data: Restaurant = req.body;
  try {
    const client = await initializeRedisClient();
    const id = nanoid();
    const restaurantKey = restaurantKeyById(id);

    const hashData = { id, name: data.name, location: data.location };
    await Promise.all([
      ...data.cuisines.map((cuisine) =>
        Promise.all([
          client.sAdd(cuisinesKey, cuisine),
          client.sAdd(cuisinesKeyById(cuisine), id),
          client.sAdd(restaurantCuisineKeyById(id), cuisine),
        ])
      ),
      client.hSet(restaurantKey, hashData),
      client.zAdd(restaurantsByRatingKey, {
        score: 0,
        value: id,
      }),
    ]);
    successResponse(res, hashData, "Restaurant added successfully");
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:restaurantId/reviews",
  checkRestaurantExists,
  validate(ReviewSchema),
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    const data: Review = req.body;
    try {
      const client = await initializeRedisClient();
      const reviewId = nanoid();

      const reviewKey = reviewKeyById(restaurantId);
      const reviewDetailsKey = reviewDetailsKeyById(reviewId);
      const restaurantKey = restaurantKeyById(restaurantId);

      const reviewData = {
        id: reviewId,
        ...data,
        timestamp: Date.now(),
        restaurantId,
      };
      const [reviewCount, setResult, totalStars] = await Promise.all([
        client.lPush(reviewKey, reviewId),
        client.hSet(reviewDetailsKey, reviewData),
        client.hIncrByFloat(restaurantKey, "totalStars", data.rating),
      ]);

      const avarageRating = Number((totalStars / reviewCount).toFixed(1));
      await Promise.all([
        client.zAdd(restaurantsByRatingKey, {
          score: avarageRating,
          value: restaurantId,
        }),
        client.hSet(restaurantKey, "avgRating", avarageRating),
      ]);
      successResponse(res, reviewData, "Review added successfully");
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:restaurantId/reviews",
  checkRestaurantExists,
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    const { page = 1, pageSize = 10 } = req.query;
    const start = (Number(page) - 1) * Number(pageSize);
    const end = start + Number(pageSize) - 1;

    try {
      const client = await initializeRedisClient();
      const reviewKey = reviewKeyById(restaurantId);

      const reviewIds = await client.lRange(reviewKey, start, end);
      const reviews = await Promise.all(
        reviewIds.map((id) => client.hGetAll(reviewDetailsKeyById(id)))
      );
      successResponse(res, reviews, "Reviews found");
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/:restaurantId/reviews/:reviewId",
  checkRestaurantExists,
  async (
    req: Request<{ restaurantId: string; reviewId: string }>,
    res,
    next
  ) => {
    const { restaurantId, reviewId } = req.params;
    try {
      const client = await initializeRedisClient();
      const reviewKey = reviewKeyById(restaurantId);
      const reviewDetailKey = reviewDetailsKeyById(reviewId);

      const [removeResult, deleteResult] = await Promise.all([
        client.lRem(reviewKey, 0, reviewId),
        client.del(reviewDetailKey),
      ]);
      if (removeResult === 0 && deleteResult === 0) {
        errorResponse(res, 404, "Review not found");
      }
      successResponse(res, reviewId, "Review deleted successfully");
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:restaurantId",
  checkRestaurantExists,
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    try {
      const client = await initializeRedisClient();
      const restaurantKey = restaurantKeyById(restaurantId);

      const [viewCount, restaurant, cuisines] = await Promise.all([
        client.hIncrBy(restaurantKey, "viewCount", 1),
        client.hGetAll(restaurantKey),
        client.sMembers(restaurantCuisineKeyById(restaurantId)),
      ]);
      successResponse(res, { ...restaurant, cuisines }, "Restaurant found");
    } catch (error) {
      next(error);
    }
  }
);

export default router;
