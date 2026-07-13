import { buildDeliveryBundle } from "./delivery-bundle";

if (process.argv[1]?.endsWith("build-delivery-bundle.ts")) {
  const artifactDir = process.argv[2] ?? "dist/delivery/linux-arm64";
  const outputDir = process.argv[3] ?? ".artifacts/delivery-substrate-v1";
  buildDeliveryBundle(process.cwd(), artifactDir, outputDir);
}
