import { SchemaFieldTypes } from "redis";
import { initializeRedisClient } from "../utils/client.js";
import { getKeyName, indexKey } from "../utils/keys.js";

async function createIndex() {
  const client = await initializeRedisClient();
  try {
    await client.ft.dropIndex(indexKey);
  } catch (error) {
    console.log("No existing index found");
  }
  await client.ft.create(
    indexKey,
    {
      id: {
        type: SchemaFieldTypes.TEXT,
        AS: "id",
      },
      name: {
        type: SchemaFieldTypes.TEXT,
        AS: "name",
      },
      avgStars: {
        type: SchemaFieldTypes.NUMERIC,
        AS: "avgStars",
        SORTABLE: true,
      },
    },
    {
      ON: "HASH",
      PREFIX: getKeyName("restaurant"),
    }
  );
}

await createIndex();
process.exit(0);
