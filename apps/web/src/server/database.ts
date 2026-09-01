import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { requireServerEnv } from "@/server/config";

let databaseClient: NeonQueryFunction<false, false> | null = null;

export function getDatabase() {
  if (!databaseClient) {
    databaseClient = neon(
      process.env.SILENTSIGNALS_DATABASE_POSTGRES_URL ??
        process.env.DATABASE_URL ??
        requireServerEnv("SILENTSIGNALS_DATABASE_POSTGRES_URL"),
    );
  }

  return databaseClient;
}
