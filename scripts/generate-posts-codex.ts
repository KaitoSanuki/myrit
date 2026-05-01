import "./load-local-env";
import { generateDailyPostsWithCodex } from "@/lib/jobs/generate-codex";
import { notifyTodayPosts } from "@/lib/jobs/notify";

const args = process.argv.slice(2);
const shouldNotify = args.includes("--notify");
const date = args.find((arg) => !arg.startsWith("--"));

generateDailyPostsWithCodex(date)
  .then(async (result) => {
    const notification = shouldNotify ? await notifyTodayPosts(result.date) : undefined;
    console.log(JSON.stringify(notification ? { ...result, notification } : result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
