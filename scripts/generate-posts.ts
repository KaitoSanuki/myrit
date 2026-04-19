import "./load-local-env";
import { generateDailyPosts } from "@/lib/jobs/generate";

const date = process.argv[2];

generateDailyPosts(date)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
