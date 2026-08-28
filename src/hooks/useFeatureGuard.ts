import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useActiveStore } from "@/hooks/useMyStores";
import { useStoreFeatures } from "@/hooks/useStoreFeatures";
import { FEATURE_LABEL, isFeatureEnabled, type FeatureKey } from "@/lib/painel-segmentos";

/** Redireciona para o Dashboard quando a função está desativada na configuração da loja. */
export function useFeatureGuard(feature: FeatureKey | null) {
  const navigate = useNavigate();
  const { active } = useActiveStore();
  const { data } = useStoreFeatures(active?.storeId, active?.store.segment);

  useEffect(() => {
    if (!feature || !data) return;
    if (isFeatureEnabled(data.features, feature)) return;
    toast.info(`${FEATURE_LABEL[feature]} está desativado no painel do seu ramo de atividade.`);
    void navigate({ to: "/painel", replace: true });
  }, [feature, data, navigate]);
}
