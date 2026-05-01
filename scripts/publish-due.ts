import "./load-local-env";
import { publishDuePosts } from "@/lib/jobs/publish";

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

const limitArg = getArg("--limit");
const platformArg = getArg("--platform");
const postId = getArg("--post-id");
const ignoreSchedule = args.includes("--ignore-schedule");
const parsedLimit = limitArg ? Number(limitArg) : undefined;

publishDuePosts({
  limit: parsedLimit && Number.isFinite(parsedLimit) ? parsedLimit : undefined,
  platform: platformArg === "x" || platformArg === "threads" ? platformArg : undefined,
  postId,
  ignoreSchedule
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
