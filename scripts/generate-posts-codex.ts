import "./load-local-env";
import { generateDailyPostsWithCodex } from "@/lib/jobs/generate-codex";

const date = process.argv[2];

generateDailyPostsWithCodex(date)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
