import { useState, useEffect } from "react";
import { Contract, BrowserProvider } from "ethers";
import {
  useAppKitAccount,
  useAppKitProvider,
} from "@reown/appkit/react";
import { setAppKitTheme } from "./web3modal";
import { initFhevm, getFhevmInstance } from "./fhevm";
import contractData from "./contracts/ConfidentialERC20.json";
import "./App.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

const STEPS = {
  transfer: [
    "Encrypting amount with FHE...",
    "Waiting for wallet signature...",
    "Broadcasting to Sepolia...",
    "Confirming on-chain...",
    "Transfer complete!",
  ],
  decrypt: [
    "Requesting decryption...",
    "Waiting for wallet signature...",
    "Sending to Zama Gateway...",
    "Gateway processing...",
    "Balance decrypted!",
  ],
  mint: [
    "Preparing mint transaction...",
    "Waiting for wallet signature...",
    "Broadcasting to Sepolia...",
    "Confirming on-chain...",
    "Tokens minted!",
  ],
};

function App() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider("eip155");

  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");
  const [contract, setContract] = useState(null);
  const [fhevmReady, setFhevmReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [txType, setTxType] = useState(null);
  const [txStep, setTxStep] = useState(0);
  const [txDone, setTxDone] = useState(false);
  const [txError, setTxError] = useState("");
  const [tokenInfo, setTokenInfo] = useState({ name: "", symbol: "", totalSupply: "" });
  const [decryptedBalance, setDecryptedBalance] = useState(null);
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [initStatus, setInitStatus] = useState("");

  // Theme toggle
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    setAppKitTheme(next ? "dark" : "light");
  }

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, []);

  // TX helpers
  function startTx(type) {
    setTxType(type); setTxStep(0); setTxDone(false); setTxError(""); setLoading(true);
  }
  function stepTx(i) { setTxStep(i); }
  function doneTx() {
    setTxDone(true); setLoading(false);
    setTimeout(() => setTxType(null), 2000);
  }
  function failTx(msg) {
    setTxError(msg); setLoading(false);
    setTimeout(() => setTxType(null), 4000);
  }

  // Init contract + fhevm
  useEffect(() => {
    if (!isConnected || !walletProvider || !CONTRACT_ADDRESS) return;
    let cancelled = false;
    async function init() {
      try {
        setInitStatus("Loading contract...");
        const provider = new BrowserProvider(walletProvider);
        const s = await provider.getSigner();
        const c = new Contract(CONTRACT_ADDRESS, contractData.abi, s);
        setContract(c);
        const [name, symbol, supply, owner] = await Promise.all([
          c.name(), c.symbol(), c.totalSupply(), c.owner(),
        ]);
        if (cancelled) return;
        setTokenInfo({ name, symbol, totalSupply: supply.toString() });
        setIsOwner(owner.toLowerCase() === address.toLowerCase());
        const cached = await c.latestDecryptedBalance(address);
        if (cached > 0n) setDecryptedBalance(cached.toString());
        setInitStatus("Loading Zama Relayer SDK...");
        await initFhevm();
        if (cancelled) return;
        setFhevmReady(true);
        setInitStatus("");
      } catch (err) {
        console.error("Init error:", err);
        if (!cancelled) setInitStatus("Error: " + err.message);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [isConnected, walletProvider, address]);

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!contract || !fhevmReady) return;
    startTx("transfer");
    try {
      stepTx(0);
      const instance = getFhevmInstance();
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.add64(BigInt(transferAmount));
      const encrypted = await input.encrypt();
      const handle = encrypted.handles[0] instanceof Uint8Array
        ? "0x" + Array.from(encrypted.handles[0]).map(b => b.toString(16).padStart(2, "0")).join("")
        : encrypted.handles[0];
      const proof = encrypted.inputProof instanceof Uint8Array
        ? "0x" + Array.from(encrypted.inputProof).map(b => b.toString(16).padStart(2, "0")).join("")
        : encrypted.inputProof;
      stepTx(1);
      const tx = await contract.transfer(transferTo, handle, proof);
      stepTx(2);
      stepTx(3);
      await tx.wait();
      stepTx(4);
      setTransferTo(""); setTransferAmount("");
      doneTx();
    } catch (err) { failTx(err.reason || err.message); }
  };

  const handleMint = async (e) => {
    e.preventDefault();
    if (!contract) return;
    startTx("mint");
    try {
      stepTx(0); stepTx(1);
      const tx = await contract.mint(mintTo || address, BigInt(mintAmount));
      stepTx(2); stepTx(3);
      await tx.wait();
      const supply = await contract.totalSupply();
      setTokenInfo((prev) => ({ ...prev, totalSupply: supply.toString() }));
      stepTx(4); setMintAmount("");
      doneTx();
    } catch (err) { failTx(err.reason || err.message); }
  };

  const requestDecryption = async () => {
    if (!contract) return;
    startTx("decrypt");
    try {
      stepTx(0); stepTx(1);
      const tx = await contract.requestBalanceDecryption();
      stepTx(2);
      await tx.wait();
      stepTx(3);
      const poll = async (attempts = 0) => {
        if (attempts > 20) { stepTx(4); setDecryptedBalance("..."); doneTx(); return; }
        const balance = await contract.latestDecryptedBalance(address);
        if (balance > 0n || attempts > 8) {
          setDecryptedBalance(balance.toString()); stepTx(4); doneTx();
        } else { setTimeout(() => poll(attempts + 1), 3000); }
      };
      poll();
    } catch (err) { failTx(err.reason || err.message); }
  };

  const steps = txType ? STEPS[txType] : [];

  return (
    <div className="app">
      {/* Transaction overlay */}
      {txType && (
        <div className="tx-overlay">
          <div className="tx-modal">
            <div className="tx-title">
              {txError ? "Transaction Failed" : txDone ? "Success" : steps[txStep]}
            </div>
            {!txError && (
              <div className="tx-steps">
                {steps.map((label, i) => (
                  <div key={i} className={`tx-step ${i < txStep ? "done" : i === txStep && !txDone ? "active" : txDone ? "done" : ""}`}>
                    <div className="tx-step-dot">
                      {i < txStep || txDone ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>
                      ) : i === txStep && !txDone ? (
                        <span className="tx-spinner" />
                      ) : (
                        <span className="tx-dot-empty" />
                      )}
                    </div>
                    <span className="tx-step-label">{label}</span>
                  </div>
                ))}
              </div>
            )}
            {txError && <div className="tx-error">{txError}</div>}
            {(txDone || txError) && (
              <button className="btn btn-primary" onClick={() => setTxType(null)}>Close</button>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav>
        <div className="nav-left">
          <span className="logo-text">ConfidentialToken</span>
          <span className="badge">Sepolia</span>
        </div>
        <div className="nav-right">
          <button className="theme-toggle" onClick={toggleTheme} title={dark ? "Light mode" : "Dark mode"}>
            {dark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>
          <appkit-button />
        </div>
      </nav>

      {/* Hero */}
      {!isConnected && (
        <section className="hero">
          <h1>Private ERC-20 Transfers</h1>
          <p>
            Balances and transfer amounts are <strong>fully encrypted</strong>{" "}
            on-chain using Zama's Fully Homomorphic Encryption. Connect your
            wallet to get started.
          </p>
          <div className="hero-features">
            <div className="feature">
              <div className="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <span>Encrypted Balances</span>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span>Private Transfers</span>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <span>ZK Proofs</span>
            </div>
          </div>
        </section>
      )}

      {/* Init status */}
      {isConnected && initStatus && (
        <div className="init-bar">
          <span className="tx-spinner" />
          {initStatus}
        </div>
      )}

      {/* Dashboard */}
      {isConnected && !initStatus && (
        <div className="dashboard">
          <div className="card">
            <div className="card-header">Token Info</div>
            <div className="info-row">
              <div className="info-item">
                <div className="info-label">Name</div>
                <div className="info-value">{tokenInfo.name || "—"}</div>
              </div>
              <div className="info-item">
                <div className="info-label">Symbol</div>
                <div className="info-value">{tokenInfo.symbol || "—"}</div>
              </div>
              <div className="info-item">
                <div className="info-label">Supply</div>
                <div className="info-value">{tokenInfo.totalSupply ? Number(tokenInfo.totalSupply).toLocaleString() : "—"}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">Your Balance</div>
            <div className="balance-box">
              {decryptedBalance !== null ? (
                <div className="balance-revealed">
                  {Number(decryptedBalance).toLocaleString()} <span>{tokenInfo.symbol}</span>
                </div>
              ) : (
                <div className="balance-locked">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  Encrypted
                </div>
              )}
            </div>
            <button className="btn btn-primary" onClick={requestDecryption} disabled={loading || !contract}>
              Decrypt via Gateway
            </button>
          </div>

          <div className="card">
            <div className="card-header">Confidential Transfer</div>
            <p className="card-desc">Amount is encrypted client-side before being sent to the chain.</p>
            <form onSubmit={handleTransfer}>
              <label>Recipient</label>
              <input type="text" placeholder="0x..." value={transferTo} onChange={(e) => setTransferTo(e.target.value)} required />
              <label>Amount</label>
              <input type="number" placeholder="0" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} min="1" required />
              <button type="submit" className="btn btn-primary" disabled={loading || !fhevmReady}>Send Privately</button>
            </form>
          </div>

          {isOwner && (
            <div className="card">
              <div className="card-header">Mint Tokens</div>
              <p className="card-desc">Owner only — mint new tokens.</p>
              <form onSubmit={handleMint}>
                <label>Recipient (blank = you)</label>
                <input type="text" placeholder="0x... (optional)" value={mintTo} onChange={(e) => setMintTo(e.target.value)} />
                <label>Amount</label>
                <input type="number" placeholder="0" value={mintAmount} onChange={(e) => setMintAmount(e.target.value)} min="1" required />
                <button type="submit" className="btn btn-primary" disabled={loading}>Mint</button>
              </form>
            </div>
          )}
        </div>
      )}

      {isConnected && !CONTRACT_ADDRESS && (
        <div className="card card-warning">
          <div className="card-header">Setup Required</div>
          <p>Set <code>VITE_CONTRACT_ADDRESS</code> in <code>frontend/.env</code></p>
        </div>
      )}

      <footer>
        Powered by{" "}
        <a href="https://www.zama.org" target="_blank" rel="noreferrer">Zama</a>
        {" "} — Fully Homomorphic Encryption for Ethereum
      </footer>
    </div>
  );
}

export default App;
