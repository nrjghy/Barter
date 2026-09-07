import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import { ReviewService } from "../services";
import type { ReviewContext } from "../services/reviewService";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { BackBar } from "../components/BackBar";
import { pickAvatarPalette } from "../utils/avatar";
import { useShowError } from "../hooks/useShowError";

const STAR_VALUES = [1, 2, 3, 4, 5];

export const ReviewWrite: React.FC = () => {
  const { tradeCompletionId } = useParams<{ tradeCompletionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const showError = useShowError();

  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<ReviewContext | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!tradeCompletionId || !user) return;
      setLoading(true);

      const [contextResult, eligibleResult] = await Promise.all([
        ReviewService.getReviewContext(tradeCompletionId, user.id),
        ReviewService.canReviewTrade(tradeCompletionId, user.id),
      ]);

      if (cancelled) return;

      if (contextResult.error || !contextResult.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setContext(contextResult.data);
      // canReviewTrade rechecks participancy too, but getReviewContext
      // succeeding above already confirms that -- the only remaining
      // reason it'd come back ineligible here is an existing review for
      // this trade. There's no dispute-window gate: the review reminder
      // is a nudge, not a gate (PRD §4), so someone can always come back
      // and review later.
      setAlreadyReviewed(!eligibleResult.data);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tradeCompletionId, user]);

  const handleSkip = () => {
    navigate(context ? `/chat/${context.connectionId}` : "/chat");
  };

  const handleSubmit = async () => {
    if (!tradeCompletionId || !context || !user || rating === 0 || submitting) return;

    setSubmitting(true);
    try {
      const { error } = await ReviewService.createReview(
        {
          tradeCompletionId,
          revieweeId: context.reviewee.id,
          rating,
          comment: comment.trim() || undefined,
        },
        user.id
      );

      if (error) {
        showError(error);
        return;
      }

      toast.success("Review submitted");
      navigate(`/chat/${context.connectionId}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex items-center justify-center bg-[oklch(99%_0.006_95)]">
        <LoadingSpinner />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[oklch(99%_0.006_95)] pt-16">
        <BackBar title="Write a review" onBack={() => navigate("/chat")} />
        <div className="flex-1 flex items-center justify-center text-center px-8">
          <div className="text-sm text-[oklch(45%_0.02_95)]">This trade couldn't be found.</div>
        </div>
      </div>
    );
  }

  if (alreadyReviewed) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[oklch(99%_0.006_95)] pt-16">
        <BackBar title="Write a review" onBack={handleSkip} />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-2">
          <div className="text-sm font-semibold text-[oklch(22%_0.02_100)]">You've already reviewed this trade</div>
          <div className="text-[13px] text-[oklch(45%_0.02_95)]">Thanks for sharing your feedback.</div>
        </div>
      </div>
    );
  }

  const palette = pickAvatarPalette(context!.reviewee.id);
  const initials = context!.reviewee.username.charAt(0).toUpperCase();

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[oklch(99%_0.006_95)] pt-16">
      <BackBar title="Write a review" onBack={handleSkip} />

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex flex-col items-center gap-2 mb-2">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-[22px] font-bold"
            style={{ background: palette.bg, color: palette.color }}
          >
            {initials}
          </div>
          <div className="text-[17px] font-extrabold text-[oklch(22%_0.02_100)]">{context!.reviewee.username}</div>
          {context!.itemLabel && (
            <div className="text-[12.5px] text-[oklch(45%_0.02_95)]">Traded: {context!.itemLabel}</div>
          )}
        </div>

        <div className="flex justify-center gap-2.5 my-6">
          {STAR_VALUES.map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              className="text-[34px] leading-none"
              style={{ color: n <= rating ? "oklch(60% 0.1 55)" : "oklch(85% 0.015 90)" }}
            >
              {n <= rating ? "★" : "☆"}
            </button>
          ))}
        </div>

        <div className="text-[11px] font-bold text-[oklch(45%_0.02_95)] tracking-wide mt-5 mb-2">
          COMMENT (OPTIONAL)
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share more about the trade…"
          className="w-full min-h-[100px] px-3.5 py-3 rounded-2xl border border-[oklch(88%_0.015_90)] text-[13.5px] text-[oklch(22%_0.02_100)] resize-y"
        />
      </div>

      <div className="flex-shrink-0 flex flex-col gap-2 px-5 pt-3.5 pb-6 border-t border-[oklch(88%_0.015_90)]">
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="w-full py-3.5 rounded-2xl bg-barter-600 text-white text-sm font-bold text-center disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit review"}
        </button>
        <button
          onClick={handleSkip}
          className="w-full py-3.5 rounded-2xl bg-transparent text-[oklch(45%_0.02_95)] text-sm font-semibold text-center"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
};
