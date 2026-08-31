import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { requireServerEnv } from "@/server/config";

let databaseClient: NeonQueryFunction<false, false> | null = null;

export function getDatabase() {
  if (!databaseClient) {
    databaseClient = neon(requireServerEnv("DATABASE_URL"));
  }

  return databaseClient;
}
