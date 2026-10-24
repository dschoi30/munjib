import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { calibrate } from "../../lib/rag/evaluation/calibration";
async function main(){
  const {values}=parseArgs({options:{report:{type:"string"},labels:{type:"string"}}});
  if(!values.report || !values.labels) throw new Error("CALIBRATION_INPUT_REQUIRED");
  const result=calibrate(JSON.parse(await readFile(values.report,"utf8")),JSON.parse(await readFile(values.labels,"utf8")));
  console.log(JSON.stringify(result,null,2));if(!result.eligibleForGate)process.exitCode=1;
}
main().catch(()=>{console.error("CALIBRATION_FAILED");process.exitCode=1;});
