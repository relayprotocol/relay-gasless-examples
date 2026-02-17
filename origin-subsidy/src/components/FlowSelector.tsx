import React from "react";

export type FlowType = "7702" | "4337";

interface Props {
  active: FlowType;
  onChange: (flow: FlowType) => void;
}

const FLOWS: { id: FlowType; label: string; desc: string }[] = [
  {
    id: "7702",
    label: "EIP-7702",
    desc: "EOA signs off-chain authorization",
  },
  {
    id: "4337",
    label: "ERC-4337",
    desc: "Smart account via UserOperation",
  },
];

export function FlowSelector({ active, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {FLOWS.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`flex-1 rounded px-4 py-3 text-left transition-colors border ${
            active === f.id
              ? "bg-blue-600/20 border-blue-500 text-white"
              : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600"
          }`}
        >
          <div className="text-sm font-bold">{f.label}</div>
          <div className="text-xs opacity-70">{f.desc}</div>
        </button>
      ))}
    </div>
  );
}
