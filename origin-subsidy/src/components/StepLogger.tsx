import React, { useState } from "react";

export interface LogEntry {
  timestamp: number;
  label: string;
  type: "info" | "success" | "error" | "pending";
  detail?: string;
}

const COLORS: Record<LogEntry["type"], string> = {
  info: "text-gray-400",
  success: "text-green-400",
  error: "text-red-400",
  pending: "text-yellow-400",
};

const ICONS: Record<LogEntry["type"], string> = {
  info: "\u2022",
  success: "\u2713",
  error: "\u2717",
  pending: "\u25CB",
};

function LogRow({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs font-mono leading-relaxed">
      <div
        className={`flex gap-2 ${entry.detail ? "cursor-pointer hover:bg-gray-800/50 rounded px-1 -mx-1" : ""}`}
        onClick={() => entry.detail && setOpen((o) => !o)}
      >
        <span className={COLORS[entry.type]}>{ICONS[entry.type]}</span>
        <span className={COLORS[entry.type]}>{entry.label}</span>
        {entry.detail && (
          <span className="text-gray-600 ml-auto">{open ? "\u25B4" : "\u25BE"}</span>
        )}
      </div>
      {open && entry.detail && (
        <pre className="ml-5 mt-1 mb-1 text-[10px] text-gray-500 bg-gray-900 rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap">
          {entry.detail}
        </pre>
      )}
    </div>
  );
}

export function StepLogger({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) return null;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-4 space-y-1">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
        Execution Log
      </h3>
      {logs.map((e, i) => (
        <LogRow key={i} entry={e} />
      ))}
    </div>
  );
}
