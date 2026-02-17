import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { OriginSub4337 } from "./flows/OriginSub4337";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Relay Gasless Bridge</h1>
            <p className="text-xs text-gray-500">
              Connect owner wallet + enter Safe address. Sign one EIP-712
              message, Relay handles tx + origin gas.
            </p>
          </div>
          <ConnectButton />
        </div>

        <OriginSub4337 />
      </div>
    </div>
  );
}
