const SDK_CDN_URL = "https://cdn.zama.org/relayer-sdk-js/0.4.1/relayer-sdk-js.umd.cjs";
const RELAYER_URL = "https://relayer.testnet.zama.org";
const NETWORK_URL = "https://sepolia.gateway.tenderly.co/1cAYJQS9HFGwg8eKrTkjdj";

let instance = null;
let sdkLoaded = false;

function loadRelayerSDK() {
  return new Promise((resolve, reject) => {
    if (window.relayerSDK) {
      resolve(window.relayerSDK);
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_CDN_URL;
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => {
      if (window.relayerSDK) {
        resolve(window.relayerSDK);
      } else {
        reject(new Error("relayerSDK not found on window after load"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load relayer SDK"));
    document.head.appendChild(script);
  });
}

export async function initFhevm() {
  if (instance) return instance;

  const sdk = await loadRelayerSDK();

  if (!sdkLoaded) {
    await sdk.initSDK();
    sdkLoaded = true;
  }

  const config = {
    ...sdk.SepoliaConfig,
    relayerUrl: `${RELAYER_URL}/v2`,
    network: NETWORK_URL,
    relayerRouteVersion: 2,
  };

  instance = await sdk.createInstance(config);
  return instance;
}

export function getFhevmInstance() {
  return instance;
}
