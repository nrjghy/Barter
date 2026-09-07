import React from "react";
import { motion } from "framer-motion";
import { X, Copy, Share2 } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "./LoadingSpinner";
import { useGroupInviteLinks } from "../hooks/useGroups";
import { shareGroupInvite, copyToClipboard } from "../utils/share";
import { GroupInviteLink } from "../services/groupService";
import { useShowError } from "../hooks/useShowError";

const APP_URL = "https://letsbarter.app";

interface GroupInviteLinkModalProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export const GroupInviteLinkModal: React.FC<GroupInviteLinkModalProps> = ({ groupId, groupName, onClose }) => {
  const { links, linksLoading, createLink, createLinkLoading, revokeLink, revokingLinkId } = useGroupInviteLinks(groupId);
  const showError = useShowError();

  const activeLinks = links.filter((link) => !link.revokedAt);

  const handleCreate = async () => {
    const result = await createLink();
    if (result.error) {
      showError(result.error);
    }
  };

  const handleCopy = async (token: string) => {
    if (await copyToClipboard(`${APP_URL}/join/${token}`)) {
      toast.success("Link copied to clipboard");
    } else {
      toast.error("Couldn't copy the link.");
    }
  };

  const handleRevoke = async (link: GroupInviteLink) => {
    const result = await revokeLink(link.id);
    if (result.error) {
      showError(result.error);
    } else {
      toast.success("Invite link revoked");
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
        className="bg-white rounded-b-3xl sm:rounded-3xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[oklch(92%_0.01_95)] flex-shrink-0">
          <h2 className="text-lg font-bold text-[oklch(22%_0.02_100)]">Invite via link</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <button
            onClick={handleCreate}
            disabled={createLinkLoading}
            className="w-full px-4 py-3 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors font-medium disabled:opacity-50"
          >
            {createLinkLoading ? <LoadingSpinner /> : activeLinks.length > 0 ? "Create new invite link" : "Create invite link"}
          </button>

          <div>
            <div className="text-[11px] font-bold text-[oklch(50%_0.02_95)] tracking-wide mb-2">
              {activeLinks.length === 1 ? "ACTIVE LINK" : "ACTIVE LINKS"}
            </div>
            {linksLoading ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner />
              </div>
            ) : activeLinks.length === 0 ? (
              <p className="text-sm text-gray-500">No active invite links yet.</p>
            ) : (
              <div className="space-y-2">
                {activeLinks.map((link) => (
                  <div key={link.id} className="border border-gray-200 rounded-xl p-3">
                    <div className="text-xs text-gray-500 mb-2">
                      Created {formatDate(link.createdAt)} · Expires {formatDate(link.expiresAt)} ·{" "}
                      {link.useCount} {link.useCount === 1 ? "use" : "uses"}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(link.token)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </button>
                      <button
                        onClick={() => shareGroupInvite(groupName, link.token)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Share
                      </button>
                      <button
                        onClick={() => handleRevoke(link)}
                        disabled={revokingLinkId === link.id}
                        className="ml-auto px-3 py-1.5 text-xs font-semibold text-[oklch(50%_0.15_30)] hover:bg-[oklch(50%_0.15_30_/_0.08)] rounded-lg transition-colors disabled:opacity-50"
                      >
                        {revokingLinkId === link.id ? "Revoking…" : "Revoke"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
