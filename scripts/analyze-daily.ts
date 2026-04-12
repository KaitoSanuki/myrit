import { analyzeDailyResults } from "@/lib/jobs/analyze";

const date = process.argv[2];

analyzeDailyResults(date)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
