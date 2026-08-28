import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  defaultFeaturesFor,
  normalizeFeatures,
  segmentGroupById,
  suggestSegmentGroup,
  type FeatureKey,
  type SegmentGroupId,
} from "@/lib/painel-segmentos";

export interface StoreFeaturesConfig {
  segment: SegmentGroupId;
  features: FeatureKey[];
  configured: boolean;
}

/** Configuração do painel adaptativo da loja ativa. */
export function useStoreFeatures(storeId: string | undefined, storeSegment?: string | null) {
  return useQuery({
    queryKey: ["store-features", storeId],
    enabled: Boolean(storeId),
    staleTime: 60_000,
    queryFn: async (): Promise<StoreFeaturesConfig> => {
      const { data, error } = await supabase
        .from("store_features")
        .select("business_segment, enabled_features")
        .eq("store_id", storeId!)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (!data) {
        const suggested = suggestSegmentGroup(storeSegment);
        return { segment: suggested, features: defaultFeaturesFor(suggested), configured: false };
      }

      const segment = segmentGroupById(data.business_segment)?.id ?? suggestSegmentGroup(storeSegment);
      return {
        segment,
        features: normalizeFeatures(data.enabled_features, segment),
        configured: true,
      };
    },
  });
}

export function useSaveStoreFeatures(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { segment: SegmentGroupId; features: FeatureKey[] }) => {
      if (!storeId) throw new Error("Selecione uma loja.");
      const { error } = await supabase.from("store_features").upsert(
        {
          store_id: storeId,
          business_segment: input.segment,
          enabled_features: normalizeFeatures(input.features, input.segment),
        },
        { onConflict: "store_id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["store-features", storeId] });
    },
  });
}
