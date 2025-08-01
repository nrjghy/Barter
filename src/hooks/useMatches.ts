import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { MatchService } from "../services";

export const useMatches = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get all matches
  const {
    data: matchesData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["matches", user?.id],
    queryFn: () => MatchService.getUserMatches(user!.id),
    enabled: !!user,
  });

  // Get pending matches
  const { data: pendingMatchesData, isLoading: pendingLoading } = useQuery({
    queryKey: ["pendingMatches", user?.id],
    queryFn: () => MatchService.getPendingMatches(user!.id),
    enabled: !!user,
  });

  // Get completed matches
  const { data: completedMatchesData, isLoading: completedLoading } = useQuery({
    queryKey: ["completedMatches", user?.id],
    queryFn: () => MatchService.getCompletedMatches(user!.id),
    enabled: !!user,
  });

  // Update match mutation
  const updateMatch = useMutation({
    mutationFn: ({ matchId, status }: { matchId: string; status: "accepted" | "rejected" }) =>
      MatchService.updateMatch(matchId, { status }, user!.id),
    onSuccess: () => {
      // Invalidate all match-related queries
      queryClient.invalidateQueries({ queryKey: ["matches", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["pendingMatches", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["completedMatches", user?.id] });
    },
  });

  return {
    matches: matchesData?.data ?? [],
    pendingMatches: pendingMatchesData?.data ?? [],
    completedMatches: completedMatchesData?.data ?? [],
    loading: isLoading || pendingLoading || completedLoading,
    error: error || matchesData?.error || pendingMatchesData?.error || completedMatchesData?.error,
    updateMatch: ({ matchId, status }: { matchId: string; status: "accepted" | "rejected" }) =>
      updateMatch.mutateAsync({ matchId, status }),
    isUpdating: updateMatch.isPending,
  };
};
