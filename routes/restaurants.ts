import express, { type Request } from "express";
import { validate } from "../middlewares/validate.js";
import {
  RestaurantDetailsSchema,
  RestaurantSchema,
  type Restaurant,
  type RestaurantDetails,
} from "../schemas/restaurant.js";
import { initializeRedisClient } from "../utils/client.js";
import { nanoid } from "nanoid";
import {
  bloomKey,
  cuisinesKey,
  cuisinesKeyById,
  indexKey,
  restaurantCuisineKeyById,
  restaurantDetailsKeyById,
  restaurantKeyById,
  restaurantsByRatingKey,
  reviewDetailsKeyById,
  reviewKeyById,
  weatherKeyById,
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
    const bloomString = `${data.name} ${data.location}`;
    const seenBefore = await client.bf.exists(bloomKey, bloomString);
    if (seenBefore) {
      return errorResponse(res, 409, "Restaurant already exists");
    }

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
      client.bf.add(bloomKey, bloomString),
    ]);
    successResponse(res, hashData, "Restaurant added successfully");
  } catch (error) {
    next(error);
  }
});

router.get(
  "/:restaurantId/weather",
  checkRestaurantExists,
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    try {
      const client = await initializeRedisClient();
      const weatherKey = weatherKeyById(restaurantId);
      const cachedWeather = await client.get(weatherKey);
      if (cachedWeather) {
        return successResponse(res, JSON.parse(cachedWeather), "Weather found");
      }

      const restaurantKey = restaurantKeyById(restaurantId);
      const coords = await client.hGet(restaurantKey, "location");
      if (!coords) {
        return errorResponse(res, 404, "Location not found");
      }
      const [lng, lat] = coords.split(",");

      const apiResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.WEATHER_API_KEY}`
      );
      if (apiResponse.status !== 200) {
        return errorResponse(res, 500, "Weather API error");
      }
      const weatherData = await apiResponse.json();
      await client.set(weatherKey, JSON.stringify(weatherData), {
        EX: 60 * 60,
      });
      successResponse(res, weatherData, "Weather found");
    } catch (error) {
      next(error);
    }
  }
);

router.get("/search", async (req, res, next) => {
  const { q } = req.query;
  try {
    const client = await initializeRedisClient();
    const results = await client.ft.search(indexKey, `@name:${q}*`);
    successResponse(res, results, "Search results found");
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:restaurantId/details",
  checkRestaurantExists,
  validate(RestaurantDetailsSchema),
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    const data: RestaurantDetails = req.body;
    try {
      const client = await initializeRedisClient();
      const restaurantDetailsKey = restaurantDetailsKeyById(restaurantId);

      await client.json.set(restaurantDetailsKey, ".", data);
      successResponse(res, data, "Details added successfully");
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:restaurantId/details",
  checkRestaurantExists,
  async (req: Request<{ restaurantId: string }>, res, next) => {
    const { restaurantId } = req.params;
    try {
      const client = await initializeRedisClient();
      const restaurantDetailsKey = restaurantDetailsKeyById(restaurantId);

      const details = await client.json.get(restaurantDetailsKey);
      successResponse(res, details, "Details added successfully");
    } catch (error) {
      next(error);
    }
  }
);

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
