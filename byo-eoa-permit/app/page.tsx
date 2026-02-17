import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BridgeForm } from "@/components/BridgeForm";

export default function Home() {
  return (
    <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg font-bold">Relay Permit Bridge</h1>
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Gasless cross-chain bridging using ERC-20 permit signatures. This
          example passes{" "}
          <a
            href="https://docs.relay.link/references/api/get-quote-v2#body-use-permit"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            <code className="text-[11px]">usePermit: true</code>
          </a>{" "}
          to the Quote API. The user signs an EIP-712 typed-data permit — no gas
          or approval tx required — and Relay handles execution on both chains.
        </p>
      </div>

      <BridgeForm />
    </main>
  );
}
