"use client";

import type { CurrencyConfig } from "@/lib/types";

interface CurrencySelectorProps {
  label: string;
  value: string;
  onChange: (address: string) => void;
  currencies: CurrencyConfig[];
}

export function CurrencySelector({
  label,
  value,
  onChange,
  currencies,
}: CurrencySelectorProps) {
  return (
    <div className="flex-1">
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gray-600 transition-colors appearance-none cursor-pointer"
      >
        {currencies.map((c) => (
          <option key={c.address} value={c.address}>
            {c.symbol}
            {c.supportsPermit ? " (permit)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
