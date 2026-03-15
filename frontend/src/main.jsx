import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./web3modal";
import "./index.css";
import App from "./App.jsx";

// Inject yellow theme into Reown shadow DOMs
function patchReownButtons() {
  const style = `
    :host { --wui-color-accent-100: #ffd208 !important; --wui-color-fg-300: #000 !important; }
    button[data-testid="connect-button"], .wui-button, button.wui-connect-button {
      background: #ffd208 !important; color: #000 !important; border: none !important;
    }
  `;
  document.querySelectorAll("w3m-button, appkit-button, wui-connect-button").forEach((el) => {
    if (el.shadowRoot && !el.shadowRoot.querySelector("style[data-patched]")) {
      const s = document.createElement("style");
      s.setAttribute("data-patched", "1");
      s.textContent = style;
      el.shadowRoot.appendChild(s);
    }
  });
}

const observer = new MutationObserver(() => patchReownButtons());
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(patchReownButtons, 500);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
