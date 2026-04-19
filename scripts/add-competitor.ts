import "./load-local-env";
import { upsertCompetitor } from "@/lib/jobs/competitors";
import type { Platform } from "@/lib/types";

const [account, platform] = process.argv.slice(2);

if (!account || !isPlatform(platform)) {
  console.error("Usage: npm run add-competitor -- <account> <x|threads>");
  process.exit(1);
}

upsertCompetitor(account, platform)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

function isPlatform(value: string | undefined): value is Platform {
  return value === "x" || value === "threads";
}
