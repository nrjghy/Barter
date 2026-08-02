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
