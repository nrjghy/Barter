import React from "react";

interface BackBarProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  action?: React.ReactNode;
}

export const BackBar: React.FC<BackBarProps> = ({ title, subtitle, onBack, action }) => (
  <div className="fixed top-0 left-0 right-0 z-40 h-16 flex items-center gap-3 px-5 bg-[oklch(99%_0.006_95)] border-b border-[oklch(88%_0.015_90)]">
    <button onClick={onBack} className="p-1 -ml-1 text-2xl leading-none font-semibold text-[oklch(22%_0.02_100)] flex-shrink-0">
      ‹
    </button>
    <div className="min-w-0 flex-1">
      <div className="text-base font-bold text-[oklch(22%_0.02_100)] truncate">{title}</div>
      {subtitle && <div className="text-xs text-[oklch(50%_0.02_90)] truncate">{subtitle}</div>}
    </div>
    {action}
  </div>
);
