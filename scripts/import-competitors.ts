import { importCompetitorPostsFromEnv } from "@/lib/jobs/import-competitors";

importCompetitorPostsFromEnv()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
