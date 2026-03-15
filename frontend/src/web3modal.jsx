import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { sepolia } from "@reown/appkit/networks";

const projectId = "ca1034457c12e2567f7884446e124b89";

const ethersAdapter = new EthersAdapter();

let currentTheme = localStorage.getItem("theme") || "light";

export const appKit = createAppKit({
  adapters: [ethersAdapter],
  projectId,
  networks: [sepolia],
  defaultNetwork: sepolia,
  metadata: {
    name: "ConfidentialToken",
    description: "Privacy-preserving ERC-20 powered by Zama fhEVM",
    url: window.location.origin,
    icons: [],
  },
  themeMode: currentTheme,
  themeVariables: {
    "--w3m-accent": "#ffd208",
    "--w3m-color-mix": currentTheme === "dark" ? "#000000" : "#ffffff",
    "--w3m-color-mix-strength": 40,
    "--w3m-border-radius-master": "0px",
  },
  enableAnalytics: false,
});

export function setAppKitTheme(mode) {
  appKit.setThemeMode(mode);
  appKit.setThemeVariables({
    "--w3m-accent": "#ffd208",
    "--w3m-color-mix": mode === "dark" ? "#000000" : "#ffffff",
    "--w3m-color-mix-strength": 40,
    "--w3m-border-radius-master": "0px",
  });
}
