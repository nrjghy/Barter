import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { LoadingSpinner } from "./LoadingSpinner";

interface TransferOwnershipModalProps {
  groupName: string;
  onClose: () => void;
  onTransfer: (newCreatorUsername: string) => Promise<{ error?: { message: string } }>;
  // When set, the transfer is happening as part of a "Leave group" attempt --
  // shown as a hint above the field so the flow reads as one continuous action.
  leavingAfterTransfer?: boolean;
}

export const TransferOwnershipModal: React.FC<TransferOwnershipModalProps> = ({
  groupName,
  onClose,
  onTransfer,
  leavingAfterTransfer,
}) => {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Enter the new owner's username");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await onTransfer(username.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
    } else {
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[oklch(92%_0.01_95)]">
          <h2 className="text-lg font-bold text-[oklch(22%_0.02_100)]">Transfer ownership</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-2">
          {leavingAfterTransfer && (
            <p className="text-xs text-gray-600 mb-3">
              Transfer ownership of {groupName} before you can leave. The new owner must already be a member.
            </p>
          )}
          <label htmlFor="newCreatorUsername" className="block text-sm font-medium text-gray-700 mb-2">
            New owner's username
          </label>
          <input
            id="newCreatorUsername"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
            placeholder="username"
            autoFocus
          />
          {error && <p className="text-xs font-semibold text-[oklch(50%_0.15_30)] mt-1.5">{error}</p>}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? <LoadingSpinner /> : "Transfer"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
