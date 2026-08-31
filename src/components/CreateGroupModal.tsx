import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useCreateGroup } from "../hooks/useGroups";
import { LoadingSpinner } from "./LoadingSpinner";

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: (groupId: string) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ onClose, onCreated }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { createGroup, createGroupLoading } = useCreateGroup();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Group name is required");
      return;
    }
    setError(null);

    const result = await createGroup({ name: name.trim(), description: description.trim() || undefined });
    if (result.error) {
      setError(result.error.message);
    } else if (result.data) {
      onCreated(result.data.groupId);
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
          <h2 className="text-lg font-bold text-[oklch(22%_0.02_100)]">Create group</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="groupName" className="block text-sm font-medium text-gray-700 mb-2">
              Group name
            </label>
            <input
              id="groupName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
              placeholder="Mokotów Neighbors"
              autoFocus
            />
            {error && <p className="text-xs font-semibold text-[oklch(50%_0.15_30)] mt-1.5">{error}</p>}
          </div>

          <div>
            <label htmlFor="groupDescription" className="block text-sm font-medium text-gray-700 mb-2">
              Description (optional)
            </label>
            <textarea
              id="groupDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
              placeholder="What's this group for?"
            />
          </div>

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
              disabled={createGroupLoading}
              className="flex-1 px-4 py-2.5 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors font-medium disabled:opacity-50"
            >
              {createGroupLoading ? <LoadingSpinner /> : "Create group"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
