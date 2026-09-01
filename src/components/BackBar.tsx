import React, { useState } from "react";
import { HelpCircle } from "lucide-react";
import { HelpSheet } from "./HelpSheet";

interface BackBarProps {
  title: string;
  subtitle?: React.ReactNode;
  onBack: () => void;
  action?: React.ReactNode;
  // When provided, renders a "?" icon (same as Header's) that opens a
  // HelpSheet with this content. Omitted entirely on the other pages using
  // BackBar -- no icon, no behavior change.
  helpItems?: string[];
  helpTitle?: string;
}

export const BackBar: React.FC<BackBarProps> = ({ title, subtitle, onBack, action, helpItems, helpTitle }) => {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="fixed top-0 left-0 right-0 z-40 h-16 flex items-center gap-3 px-5 bg-[oklch(99%_0.006_95)] border-b border-[oklch(88%_0.015_90)]">
      <button onClick={onBack} className="p-1 -ml-1 text-2xl leading-none font-semibold text-[oklch(22%_0.02_100)] flex-shrink-0">
        ‹
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold text-[oklch(22%_0.02_100)] truncate">{title}</div>
        {subtitle && <div className="text-xs text-[oklch(50%_0.02_90)] truncate">{subtitle}</div>}
      </div>
      {helpItems && (
        <button
          onClick={() => setShowHelp(true)}
          className="p-2 -mr-1 text-[oklch(45%_0.02_95)] hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          title="Help"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      )}
      {action}
      {helpItems && (
        <HelpSheet
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={helpTitle ?? "Help"}
          items={helpItems}
        />
      )}
    </div>
  );
};
