"use client";

import type { ChainConfig } from "@/lib/types";

interface ChainSelectorProps {
  label: string;
  value: number;
  onChange: (chainId: number) => void;
  chains: ChainConfig[];
}

export function ChainSelector({
  label,
  value,
  onChange,
  chains,
}: ChainSelectorProps) {
  return (
    <div className="flex-1">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gray-600 transition-colors appearance-none cursor-pointer"
      >
        {chains.map((chain) => (
          <option key={chain.id} value={chain.id}>
            {chain.name}
          </option>
        ))}
      </select>
    </div>
  );
}
