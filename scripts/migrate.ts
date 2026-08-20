import { closeDirectDb } from "../src/lib/db/client";
import { migrate } from "../src/lib/db/migrate";

async function main() {
  const ran = await migrate();
  console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Already up to date");
  await closeDirectDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
