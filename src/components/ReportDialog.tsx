import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flag, AlertTriangle, CheckCircle } from 'lucide-react';
import { useReports } from '../hooks/useReports';
import { REPORT_REASONS } from '../types';
import { ItemWithUser } from '../hooks/useItems';
import { LoadingSpinner } from './LoadingSpinner';
import toast from 'react-hot-toast';

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: ItemWithUser;
}

export const ReportDialog: React.FC<ReportDialogProps> = ({ isOpen, onClose, item }) => {
  const { createReport, checkExistingReport, loading } = useReports();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [hasExistingReport, setHasExistingReport] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      checkExisting();
    }
  }, [isOpen, item]);

  const checkExisting = async () => {
    const exists = await checkExistingReport(item.id);
    setHasExistingReport(!!exists);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reason) {
      toast.error('Please select a reason for reporting');
      return;
    }

    try {
      const { error } = await createReport({
        reported_item_id: item.id,
        reported_user_id: item.user_id,
        reason,
        description: description.trim() || undefined,
      });

      if (error) {
        toast.error('Failed to submit report');
      } else {
        setSubmitted(true);
        toast.success('Report submitted successfully');
        setTimeout(() => {
          onClose();
          setSubmitted(false);
          setReason('');
          setDescription('');
        }, 2000);
      }
    } catch (error) {
      toast.error('Failed to submit report');
    }
  };

  const handleClose = () => {
    onClose();
    setSubmitted(false);
    setReason('');
    setDescription('');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Flag className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Report Listing</h2>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            {/* Item Preview */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gray-200 rounded-lg overflow-hidden">
                  {item.image_url && item.image_url.trim() !== '' ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-sm text-gray-600">by {item.users.username}</p>
                </div>
              </div>
            </div>

            {hasExistingReport ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Already Reported
                </h3>
                <p className="text-gray-600">
                  You have already reported this listing. Our team will review it soon.
                </p>
              </div>
            ) : submitted ? (
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Report Submitted
                </h3>
                <p className="text-gray-600">
                  Thank you for helping keep our community safe. We'll review this report soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Why are you reporting this listing? *
                  </label>
                  <div className="space-y-2">
                    {REPORT_REASONS.map(({ value, label }) => (
                      <label
                        key={value}
                        className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="radio"
                          name="reason"
                          value={value}
                          checked={reason === value}
                          onChange={(e) => setReason(e.target.value)}
                          className="text-red-600 focus:ring-red-500"
                        />
                        <span className="text-gray-900">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Details (Optional)
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Provide any additional context that might help our review..."
                    maxLength={500}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {description.length}/500 characters
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      <p className="font-medium mb-1">Important:</p>
                      <p>
                        False reports may result in account restrictions. Only report listings that genuinely violate our community guidelines.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !reason}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <LoadingSpinner />
                    ) : (
                      <>
                        <Flag className="w-4 h-4" />
                        <span>Submit Report</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};