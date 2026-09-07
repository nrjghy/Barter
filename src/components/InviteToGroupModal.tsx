import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { LoadingSpinner } from "./LoadingSpinner";
import { GroupService } from "../services/groupService";
import { shareGroupInvite } from "../utils/share";
import { useShowError } from "../hooks/useShowError";

interface InviteToGroupModalProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
  onInvite: (identifier: string) => Promise<{ error?: { message: string } }>;
}

export const InviteToGroupModal: React.FC<InviteToGroupModalProps> = ({ groupId, groupName, onClose, onInvite }) => {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingInviteLink, setCreatingInviteLink] = useState(false);
  const showError = useShowError();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError("Enter a username or email");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await onInvite(identifier.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
    } else {
      onClose();
    }
  };

  const handleInviteToBarter = async () => {
    setCreatingInviteLink(true);
    const result = await GroupService.createGroupInviteLink(groupId);
    setCreatingInviteLink(false);
    if (result.error) {
      showError(result.error);
    } else {
      await shareGroupInvite(groupName, result.data!.token);
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
          <h2 className="text-lg font-bold text-[oklch(22%_0.02_100)]">Invite to {groupName}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-2">
          <label htmlFor="inviteIdentifier" className="block text-sm font-medium text-gray-700 mb-2">
            Username or email
          </label>
          <input
            id="inviteIdentifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
            placeholder="name@example.com"
            autoFocus
          />
          {error === "No matching user found" ? (
            <p className="text-xs font-semibold text-[oklch(50%_0.15_30)] mt-1.5">
              No matching user found.{" "}
              <button
                type="button"
                onClick={handleInviteToBarter}
                disabled={creatingInviteLink}
                className="underline text-barter-600 hover:text-barter-700 disabled:opacity-50"
              >
                {creatingInviteLink ? "Creating invite…" : "Invite user to Barter"}
              </button>
              ?
            </p>
          ) : error ? (
            <p className="text-xs font-semibold text-[oklch(50%_0.15_30)] mt-1.5">{error}</p>
          ) : (
            <p className="text-xs text-gray-500 mt-1.5">They'll get a notification to accept or decline.</p>
          )}

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
              {loading ? <LoadingSpinner /> : "Send invite"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
