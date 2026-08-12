import React from 'react';
import { Lightbulb, X } from 'lucide-react';

interface OnboardingHintProps {
  isOpen: boolean;
  text: string;
  onDismiss: () => void;
}

export const OnboardingHint: React.FC<OnboardingHintProps> = ({ isOpen, text, onDismiss }) => {
  if (!isOpen) return null;

  return (
    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-barter-50 border border-barter-200 mb-4">
      <Lightbulb className="w-4 h-4 text-barter-600 flex-shrink-0 mt-0.5" />
      <p className="flex-1 text-[12.5px] text-barter-800 leading-relaxed">{text}</p>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-barter-400 hover:text-barter-600 flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
