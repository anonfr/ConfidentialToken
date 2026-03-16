import { initFhevm as initWasm, createInstance } from "fhevmjs";

// These addresses MUST match SepoliaZamaFHEVMConfig in the contract
const ACL_ADDRESS = "0xFee8407e2f5e3Ee68ad77cAE98c434e637f516e5";
const KMS_ADDRESS = "0x9D6891A6240D6130c54ae243d8005063D05fE14b";
const GATEWAY_URL = "https://relayer.testnet.zama.org";
const NETWORK_URL = "https://sepolia.gateway.tenderly.co/1cAYJQS9HFGwg8eKrTkjdj";

let instance = null;
let wasmReady = false;

export async function initFhevm() {
  if (instance) return instance;
  if (!wasmReady) {
    await initWasm();
    wasmReady = true;
  }
  instance = await createInstance({
    kmsContractAddress: KMS_ADDRESS,
    aclContractAddress: ACL_ADDRESS,
    networkUrl: NETWORK_URL,
    gatewayUrl: GATEWAY_URL,
  });
  return instance;
}

export function getFhevmInstance() {
  return instance;
}
