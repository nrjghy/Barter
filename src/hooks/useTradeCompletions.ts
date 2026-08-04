import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { TradeCompletionService } from "../services";

/**
 * Count of trades the current user has completed, for Profile stats.
 */
export const useTradeCompletions = () => {
  const { user } = useAuth();

  const {
    data: completedTradeCountData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["completedTradeCount", user?.id],
    queryFn: () => TradeCompletionService.getCompletedTradeCount(user!.id),
    enabled: !!user,
  });

  return {
    completedTradeCount: completedTradeCountData?.data ?? 0,
    loading: isLoading,
    error: error || completedTradeCountData?.error,
  };
};

/**
 * Dispute-relevant fields (completedBy/disputeDeadline/disputedAt) for a set
 * of trade_completions rows, keyed by id. Used by ChatThread to decide
 * whether to show a "Dispute this trade" action on a system message.
 */
export const useTradeCompletionsByIds = (ids: string[]) => {
  const sortedIds = [...ids].sort();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tradeCompletionsByIds", sortedIds],
    queryFn: () => TradeCompletionService.getTradeCompletionsByIds(sortedIds),
    enabled: sortedIds.length > 0,
  });

  return {
    tradeCompletionsById: data?.data ?? {},
    loading: isLoading,
    error: error || data?.error,
  };
};
