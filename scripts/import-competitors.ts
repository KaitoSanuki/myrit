import "./load-local-env";
import { readFile } from "node:fs/promises";
import { importCompetitorPosts, importCompetitorPostsFromEnv, type ImportedCompetitorPost } from "@/lib/jobs/import-competitors";

const filePath = process.argv[2];

const run = async () => {
  if (!filePath) return importCompetitorPostsFromEnv();

  const raw = await readFile(filePath, "utf8");
  return importCompetitorPosts(JSON.parse(raw) as ImportedCompetitorPost[]);
};

run()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
