import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { LoadingSpinner } from "./LoadingSpinner";

interface TransferOwnershipModalProps {
  groupName: string;
  members: { userId: string; username: string; role: string }[];
  onClose: () => void;
  onTransfer: (newCreatorId: string) => Promise<{ error?: { message: string } }>;
  // When set, the transfer is happening as part of a "Leave group" attempt --
  // shown as a hint above the field so the flow reads as one continuous action.
  leavingAfterTransfer?: boolean;
}

export const TransferOwnershipModal: React.FC<TransferOwnershipModalProps> = ({
  groupName,
  members,
  onClose,
  onTransfer,
  leavingAfterTransfer,
}) => {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError("Choose the new owner");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await onTransfer(selectedUserId);
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
          <label className="block text-sm font-medium text-gray-700 mb-2">New owner</label>
          {members.length === 0 ? (
            <p className="text-xs text-gray-500">No other members to transfer ownership to.</p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <label
                  key={member.userId}
                  className="flex items-center space-x-2 text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-2"
                >
                  <input
                    type="radio"
                    name="newCreatorId"
                    value={member.userId}
                    checked={selectedUserId === member.userId}
                    onChange={() => setSelectedUserId(member.userId)}
                    className="w-4 h-4 border-gray-300 text-barter-600 focus:ring-barter-600"
                  />
                  <span>{member.username}</span>
                </label>
              ))}
            </div>
          )}
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
