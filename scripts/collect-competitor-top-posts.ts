import "./load-local-env";
import { collectWeeklyTopCompetitorPosts } from "@/lib/jobs/collect-competitor-top-posts";

const days = process.argv[2] ? Number(process.argv[2]) : undefined;
const maxAccounts = process.argv[3] ? Number(process.argv[3]) : undefined;
const maxPages = process.argv[4] ? Number(process.argv[4]) : undefined;

if (maxAccounts) process.env.X_COMPETITOR_MAX_ACCOUNTS = String(maxAccounts);
if (maxPages) process.env.X_COMPETITOR_TIMELINE_MAX_PAGES = String(maxPages);

collectWeeklyTopCompetitorPosts(days)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
