import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

interface HelpSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: string[];
  // Only Header's usage surfaces this -- a BackBar-driven help sheet
  // already sits next to its own page-specific Report entry point.
  onReportIssue?: () => void;
}

export const HelpSheet: React.FC<HelpSheetProps> = ({ isOpen, onClose, title, items, onReportIssue }) => {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="bg-white rounded-b-3xl sm:rounded-3xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[oklch(92%_0.01_95)]">
          <h2 className="text-lg font-bold text-[oklch(22%_0.02_100)]">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <ul className="space-y-3">
            {items.map((item, index) => (
              <li key={index} className="flex items-start gap-2.5 text-sm text-gray-700 leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-barter-600 flex-shrink-0 mt-1.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {onReportIssue && (
            <button
              onClick={onReportIssue}
              className="w-full mt-5 pt-4 border-t border-[oklch(92%_0.01_95)] text-sm font-medium text-barter-600 hover:text-barter-700 text-center"
            >
              Still stuck? Report an issue
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
