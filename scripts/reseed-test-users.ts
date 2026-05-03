import bcrypt from "bcryptjs";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
const list = ["sm_test","fs_test","hrm_test","acc_test","wm_test"];
(async () => {
  for (const u of list) {
    const h = await bcrypt.hash(u + "123", 10);
    const r = await db.update(users).set({ password: h }).where(eq(users.username, u)).returning({ id: users.id });
    console.log(u, "->", r.length ? "ok" : "MISSING");
  }
  process.exit(0);
})();
