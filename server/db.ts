import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool, types } = pg;

// Override node-postgres timestamp parsers to always interpret
// `timestamp without timezone` (OID 1114) and `date` (OID 1082) columns as UTC.
//
// Background: pg reads these as local-time strings and calls `new Date(str)` which
// uses the Node process TZ.  If TZ is wrong (e.g. Asia/Kolkata set in env), every
// timestamp is shifted by -5:30, producing wrong JS Date objects.  Appending 'Z'
// forces UTC interpretation regardless of the process timezone.
types.setTypeParser(1114, (str: string) => new Date(str + "Z")); // timestamp without timezone → UTC
types.setTypeParser(1082, (str: string) => str); // date column → keep as YYYY-MM-DD string (no TZ shift)

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
