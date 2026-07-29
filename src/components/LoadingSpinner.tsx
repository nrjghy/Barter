import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  // Additive, optional -- defaults to the existing purple so every current
  // call site is unaffected. Chat passes 'barter' to match its green
  // visual direction (PRD §13) instead of the app-wide purple/pink that
  // hasn't been reskinned yet.
  color?: 'purple' | 'barter';
}

const colorClasses: Record<NonNullable<LoadingSpinnerProps['color']>, string> = {
  purple: 'border-purple-200 border-t-purple-600',
  barter: 'border-barter-100 border-t-barter-600',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ color = 'purple' }) => {
  return (
    <div className="flex items-center justify-center">
      <motion.div
        className={`w-8 h-8 border-3 rounded-full ${colorClasses[color]}`}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
};
