import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { compareReports, type EvalReport } from "../../lib/rag/evaluation/report";
async function main() {
  const {values}=parseArgs({options:{baseline:{type:"string"},candidate:{type:"string"}}});
  if(!values.baseline || !values.candidate) throw new Error("BASELINE_AND_CANDIDATE_REQUIRED");
  const baseline=JSON.parse(await readFile(values.baseline,"utf8")) as EvalReport;
  const candidate=JSON.parse(await readFile(values.candidate,"utf8")) as EvalReport;
  const comparison=compareReports(baseline,candidate);
  console.log(JSON.stringify(comparison,null,2));
  if(comparison.hardFailure) process.exitCode=1;
}
main().catch(()=>{console.error("EVALUATION_COMPARISON_FAILED");process.exitCode=1;});
