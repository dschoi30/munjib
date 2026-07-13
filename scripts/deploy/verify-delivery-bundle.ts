import { verifyDeliveryBundle } from "./delivery-bundle";

if (process.argv[1]?.endsWith("verify-delivery-bundle.ts")) {
  const bundleDir = process.argv[2] ?? ".artifacts/delivery-substrate-v1";
  verifyDeliveryBundle(process.cwd(), bundleDir);
}
