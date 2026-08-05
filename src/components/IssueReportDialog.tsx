import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, HelpCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import { IssuesService } from "../services";
import type { IssueType } from "../services/issuesService";

interface IssueReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const ISSUE_TYPES: { value: IssueType; label: string }[] = [
  { value: "bug", label: "Something's broken" },
  { value: "feature_request", label: "Feature request" },
  { value: "general", label: "General feedback" },
  { value: "other", label: "Other" },
];

export const IssueReportDialog: React.FC<IssueReportDialogProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issueType, setIssueType] = useState<IssueType | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setIssueType(null);
    setImageFile(null);
    setImagePreviewUrl(null);
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
    resetForm();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
  };

  const canSubmit = !!title.trim() && !!description.trim() && !!issueType && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !user || !issueType) return;

    setSubmitting(true);
    try {
      const { error } = await IssuesService.createIssue(
        {
          title: title.trim(),
          description: description.trim(),
          issueType,
          imageFiles: imageFile ? [imageFile] : undefined,
        },
        user.id
      );

      if (error) {
        toast.error(error.message || "Couldn't submit your report. Please try again.");
        return;
      }

      toast.success("Thanks — your report was submitted");
      onClose();
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-[oklch(20%_0.02_100_/_0.4)] z-50 overflow-y-auto p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col mx-auto my-8"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-[oklch(88%_0.015_90)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-barter-100 flex items-center justify-center text-barter-700">
                <HelpCircle className="w-[18px] h-[18px]" />
              </div>
              <h2 className="text-base font-bold text-[oklch(22%_0.02_100)]">Report an issue</h2>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-[oklch(96%_0.01_90)]">
              <X className="w-5 h-5 text-[oklch(45%_0.02_95)]" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4.5 space-y-4">
            <div>
              <div className="text-[11px] font-bold text-[oklch(45%_0.02_95)] tracking-wide mb-2">
                WHAT'S THIS ABOUT?
              </div>
              <div className="flex flex-col gap-2">
                {ISSUE_TYPES.map(({ value, label }) => {
                  const selected = issueType === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setIssueType(value)}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl border text-left ${
                        selected ? "border-barter-600" : "border-[oklch(88%_0.015_90)]"
                      }`}
                    >
                      <span
                        className={`w-[18px] h-[18px] rounded-full border flex-shrink-0 flex items-center justify-center ${
                          selected ? "border-barter-600" : "border-[oklch(80%_0.015_90)]"
                        }`}
                      >
                        {selected && <span className="w-[9px] h-[9px] rounded-full bg-barter-600" />}
                      </span>
                      <span className="text-sm font-semibold text-[oklch(22%_0.02_100)]">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                htmlFor="issue-title"
                className="block text-[11px] font-bold text-[oklch(45%_0.02_95)] tracking-wide mb-2"
              >
                TITLE
              </label>
              <input
                id="issue-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[oklch(88%_0.015_90)] text-sm text-[oklch(22%_0.02_100)]"
              />
            </div>

            <div>
              <label
                htmlFor="issue-description"
                className="block text-[11px] font-bold text-[oklch(45%_0.02_95)] tracking-wide mb-2"
              >
                DESCRIPTION
              </label>
              <textarea
                id="issue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened? What did you expect instead?"
                className="w-full min-h-[100px] px-3.5 py-3 rounded-2xl border border-[oklch(88%_0.015_90)] text-[13.5px] text-[oklch(22%_0.02_100)] resize-y"
              />
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                onChange={handleFileSelected}
                className="hidden"
              />
              {imagePreviewUrl ? (
                <div className="relative inline-block">
                  <img
                    src={imagePreviewUrl}
                    alt="Attached"
                    className="w-20 h-20 rounded-xl object-cover border border-[oklch(88%_0.015_90)]"
                  />
                  <button
                    onClick={handleRemoveImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[oklch(22%_0.02_100)] text-white flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-[oklch(80%_0.015_90)] text-[13px] font-semibold text-[oklch(45%_0.02_95)]"
                >
                  <Camera className="w-4 h-4" />
                  Attach a screenshot (optional)
                </button>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 px-5 pt-3.5 pb-5 border-t border-[oklch(88%_0.015_90)]">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-3.5 rounded-2xl bg-barter-600 text-white text-sm font-bold disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
