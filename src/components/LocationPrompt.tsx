import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";

interface LocationPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LocationPrompt: React.FC<LocationPromptProps> = ({ isOpen, onClose }) => {
  const { updateProfile } = useAuth();
  const [sharing, setSharing] = useState(false);

  const dismiss = async () => {
    await updateProfile({ locationPromptDismissedAt: new Date().toISOString() });
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser");
      return;
    }

    setSharing(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const locationString = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

        const { error } = await updateProfile({
          location: locationString,
          latitude,
          longitude,
          locationPromptDismissedAt: new Date().toISOString(),
        });

        setSharing(false);

        if (error) {
          toast.error("Failed to update location");
          return;
        }

        toast.success("Location shared!");
        onClose();
      },
      async () => {
        setSharing(false);
        await dismiss();
        onClose();
      }
    );
  };

  const handleNotNow = async () => {
    await dismiss();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 overflow-y-auto p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl max-w-md w-full overflow-hidden flex flex-col mx-auto my-8"
        >
          <div className="px-5 pt-6 pb-4 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-barter-100 flex items-center justify-center text-barter-600 mb-3">
              <MapPin className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">
              Share your location to find nearby items
            </h2>
            <p className="text-[13.5px] text-gray-600">
              We'll use it to show you items and matches close to you.
            </p>
          </div>

          <div className="px-5 pt-1 pb-5 flex flex-col gap-2">
            <button
              onClick={handleShareLocation}
              disabled={sharing}
              className="w-full py-3.5 rounded-2xl bg-barter-600 hover:bg-barter-700 text-white text-sm font-bold disabled:opacity-50"
            >
              {sharing ? "Sharing…" : "Share location"}
            </button>
            <button
              onClick={handleNotNow}
              disabled={sharing}
              className="w-full py-3.5 rounded-2xl text-gray-600 hover:text-gray-800 text-sm font-semibold disabled:opacity-50"
            >
              Not now
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
