import "./load-local-env";
import { notifyTodayPosts } from "@/lib/jobs/notify";

const date = process.argv[2];

notifyTodayPosts(date)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
