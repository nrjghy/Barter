import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { LoadingSpinner } from "./LoadingSpinner";

interface EditGroupDetailsModalProps {
  groupName: string;
  groupDescription: string | null;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<{ error?: { message: string } }>;
}

export const EditGroupDetailsModal: React.FC<EditGroupDetailsModalProps> = ({
  groupName,
  groupDescription,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(groupName);
  const [description, setDescription] = useState(groupDescription ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Group name is required");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await onSave(name.trim(), description.trim());
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
          <h2 className="text-lg font-bold text-[oklch(22%_0.02_100)]">Edit group details</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent resize-none"
            />
          </div>
          {error && <p className="text-xs font-semibold text-[oklch(50%_0.15_30)]">{error}</p>}

          <div className="flex gap-3 pt-2">
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
              {loading ? <LoadingSpinner /> : "Save"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
