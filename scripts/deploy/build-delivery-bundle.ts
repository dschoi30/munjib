import { buildDeliveryBundle } from "./delivery-bundle";

if (process.argv[1]?.endsWith("build-delivery-bundle.ts")) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const artifactDir = args[0] ?? "dist/delivery/linux-arm64";
  const outputDir = args[1] ?? ".artifacts/delivery-substrate-v1";
  buildDeliveryBundle(process.cwd(), artifactDir, outputDir);
}
