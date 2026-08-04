import React from 'react';
import { motion } from 'framer-motion';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex items-center justify-center">
      <motion.div
        className="w-8 h-8 border-3 rounded-full border-barter-100 border-t-barter-600"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
};
