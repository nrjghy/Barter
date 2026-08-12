import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
  label: string; // used in aria-label, e.g. "Trade", "Cancel listing"
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, label }) => {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={`More info: ${label}`}
        className="p-0.5 text-[oklch(55%_0.02_95)] hover:text-[oklch(40%_0.02_95)] flex-shrink-0"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 w-56 p-3 rounded-xl bg-[oklch(22%_0.02_100)] text-white text-[12px] leading-relaxed shadow-lg z-50">
            {text}
          </div>
        </>
      )}
    </span>
  );
};
