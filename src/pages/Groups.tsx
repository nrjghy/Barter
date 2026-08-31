import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Users, Plus } from "lucide-react";
import { BackBar } from "../components/BackBar";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { CreateGroupModal } from "../components/CreateGroupModal";
import { useUserGroups } from "../hooks/useGroups";

export const Groups: React.FC = () => {
  const navigate = useNavigate();
  const { groups, loading } = useUserGroups();
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[oklch(99%_0.006_95)] pt-16">
      <BackBar title="Groups" onBack={() => navigate("/profile")} />

      <div className="flex-1 px-5 py-5">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full mb-5 px-4 py-3 bg-barter-600 text-white font-semibold rounded-xl hover:bg-barter-700 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create group
        </button>

        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 bg-barter-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-barter-600" />
            </div>
            <h3 className="text-base font-bold text-[oklch(22%_0.02_100)] mb-1.5">No groups yet</h3>
            <p className="text-sm text-gray-600">Join a neighborhood or hobby group to trade privately.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[oklch(92%_0.01_95)] divide-y divide-[oklch(92%_0.01_95)]">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => navigate(`/groups/${group.id}`)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold text-[oklch(22%_0.02_100)]">{group.name}</span>
                    {group.role === "creator" && (
                      <span className="px-1.5 py-0.5 rounded-full bg-barter-100 text-barter-700 text-[10px] font-bold">
                        Creator
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[oklch(50%_0.02_95)] mt-0.5">
                    {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <CreateGroupModal
            onClose={() => setShowCreateModal(false)}
            onCreated={(groupId) => {
              setShowCreateModal(false);
              navigate(`/groups/${groupId}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
