export function getKeyName(...args: string[]) {
  return `bites:${args.join(":")}`;
}

export const restaurantKeyById = (id: string) => getKeyName("restaurant", id);
export const reviewKeyById = (id: string) => getKeyName("review", id);
export const reviewDetailsKeyById = (id: string) => getKeyName("reviewDetails", id);