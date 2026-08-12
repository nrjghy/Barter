import React, { useState, useRef, useLayoutEffect } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
  label: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, label }) => {
  const [open, setOpen] = useState(false);
  const iconRef = useRef<HTMLButtonElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    const popoverWidth = 224; // w-56
    const margin = 12;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - popoverWidth;
    }
    if (left < margin) {
      left = margin;
    }
    setStyle({ position: 'fixed', top: rect.bottom + 6, left });
  }, [open]);

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={iconRef}
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
          <div style={style} className="w-56 p-3 rounded-xl bg-[oklch(22%_0.02_100)] text-white text-[12px] leading-relaxed shadow-lg z-50">
            {text}
          </div>
        </>
      )}
    </span>
  );
};
