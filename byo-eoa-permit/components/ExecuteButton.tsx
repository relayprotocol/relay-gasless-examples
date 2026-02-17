"use client";

interface ExecuteButtonProps {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  label?: string;
}

export function ExecuteButton({
  onClick,
  disabled,
  loading,
  label = "Execute Bridge",
}: ExecuteButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors ${
        disabled || loading
          ? "bg-gray-800 text-gray-500 cursor-not-allowed"
          : "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
      }`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg
            className="w-4 h-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Executing...
        </span>
      ) : (
        label
      )}
    </button>
  );
}
