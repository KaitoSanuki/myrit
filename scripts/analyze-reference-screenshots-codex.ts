import "./load-local-env";
import { analyzeReferenceScreenshotsWithCodex } from "@/lib/jobs/analyze-reference-screenshots-codex";

const limit = process.argv[2] ? Number(process.argv[2]) : undefined;

analyzeReferenceScreenshotsWithCodex(limit)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
