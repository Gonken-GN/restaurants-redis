export function getKeyName(...args: string[]) {
  return `bites:${args.join(":")}`;
}

export const restaurantKeyById = (id: string) => getKeyName("restaurant", id);
export const reviewKeyById = (id: string) => getKeyName("review", id);
export const reviewDetailsKeyById = (id: string) =>
  getKeyName("reviewDetails", id);

export const cuisinesKey = getKeyName("cuisines");
export const cuisinesKeyById = (id: string) => getKeyName("cuisine", id);
export const restaurantCuisineKeyById = (id: string) =>
  getKeyName("restaurantCuisine", id);

export const restaurantsByRatingKey = getKeyName("restaurants_by_rating");

export const weatherKeyById = (id: string) => getKeyName("weather", id);

export const restaurantDetailsKeyById = (id: string) =>
  getKeyName("restaurant_details", id);

export const indexKey = getKeyName("index", "restaurants");