import { collectPostKpis } from "@/lib/jobs/collect-kpis";

collectPostKpis()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
