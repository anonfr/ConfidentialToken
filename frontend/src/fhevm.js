import { initFhevm as initWasm, createInstance } from "fhevmjs";

// Must match SepoliaZamaFHEVMConfig in the contract (fhevm@0.6.2 / 0.7.0-0)
const ACL_ADDRESS = "0xFee8407e2f5e3Ee68ad77cAE98c434e637f516e5";
const KMS_ADDRESS = "0x9D6891A6240D6130c54ae243d8005063D05fE14b";
const RELAYER_URL = "https://relayer.testnet.zama.org/v2/";
const NETWORK_URL = "https://sepolia.gateway.tenderly.co/1cAYJQS9HFGwg8eKrTkjdj";

// The live relayer API returns camelCase but fhevmjs expects snake_case.
// Patch window.fetch to normalise keyurl responses before the SDK parses them.
let fetchPatched = false;
function patchFetch() {
  if (fetchPatched) return;
  fetchPatched = true;
  const _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const res = await _fetch(input, init);
    if (!url.includes("keyurl")) return res;
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (data?.response?.fheKeyInfo) {
        const r = data.response;
        const patched = {
          ...data,
          response: {
            ...r,
            fhe_key_info: r.fheKeyInfo.map((k) => ({
              fhe_public_key: {
                data_id: k.fhePublicKey.dataId,
                urls: k.fhePublicKey.urls,
              },
            })),
            crs: Object.fromEntries(
              Object.entries(r.crs).map(([bits, v]) => [
                bits,
                { data_id: v.dataId, urls: v.urls },
              ])
            ),
          },
        };
        return new Response(JSON.stringify(patched), {
          status: res.status,
          statusText: res.statusText,
        });
      }
    } catch (_) {}
    return new Response(text, { status: res.status, statusText: res.statusText });
  };
}

let instance = null;
let wasmReady = false;

export async function initFhevm() {
  if (instance) return instance;
  patchFetch();
  if (!wasmReady) {
    await initWasm();
    wasmReady = true;
  }
  instance = await createInstance({
    kmsContractAddress: KMS_ADDRESS,
    aclContractAddress: ACL_ADDRESS,
    networkUrl: NETWORK_URL,
    relayerUrl: RELAYER_URL,
  });
  return instance;
}

export function getFhevmInstance() {
  return instance;
}
