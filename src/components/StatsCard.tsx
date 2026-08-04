import React from 'react';
import { motion } from 'framer-motion';
import { DivideIcon as LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'purple' | 'pink' | 'blue' | 'green' | 'orange';
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  color = 'purple'
}) => {
  const colorClasses = {
    purple: 'from-barter-600 to-barter-600 bg-barter-100 text-barter-600',
    pink: 'from-barter-600 to-barter-600 bg-barter-100 text-barter-600',
    blue: 'from-blue-500 to-blue-600 bg-blue-100 text-blue-600',
    green: 'from-green-500 to-green-600 bg-green-100 text-green-600',
    orange: 'from-orange-500 to-orange-600 bg-orange-100 text-orange-600',
  };

  return (
    <motion.div
      className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100"
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${colorClasses[color].split(' ')[2]} ${colorClasses[color].split(' ')[3]} flex items-center justify-center`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <div className={`flex items-center space-x-1 text-sm font-medium ${
            trend.isPositive ? 'text-green-600' : 'text-red-600'
          }`}>
            <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
          </div>
        )}
      </div>
      
      <div className="space-y-1">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-600">{title}</p>
      </div>
    </motion.div>
  );
};