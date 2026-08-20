import { closeDb } from "../src/lib/db/client";
import { migrate } from "../src/lib/db/migrate";

const ran = await migrate();
console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Already up to date");
await closeDb();
