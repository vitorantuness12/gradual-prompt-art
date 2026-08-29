import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";

import {
  Boxes,
  Armchair,
  BarChart3,
  Bike,
  
  CalendarClock,
  ClipboardList,
  CreditCard,
  Download,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageSquare,
  MonitorPlay,
  Package,
  Paintbrush,
  Plug,
  Printer,
  Settings,
  Star,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  UserCog,
  Users,
} from "lucide-react";

import { DemoBadge } from "@/components/brand/DemoBadge";
import { NotificationCenter } from "@/components/painel/NotificationCenter";
import { ThemeToggle } from "@/components/painel/ThemeToggle";
import { StorePauseButton } from "@/components/painel/StorePauseButton";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveStore } from "@/hooks/useMyStores";
import { useStoreFeatures } from "@/hooks/useStoreFeatures";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL } from "@/lib/format";
import { FEATURE_GROUPS, FEATURE_LABEL, isFeatureEnabled, type FeatureKey } from "@/lib/painel-segmentos";
import { planAllowsModule } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/painel")({
  component: PainelLayout,
});


const NAV: Record<FeatureKey, { to: string; label: string; icon: typeof LayoutDashboard }> = {
  dashboard: { to: "/painel", label: "Dashboard", icon: LayoutDashboard },
  pedidos: { to: "/painel/pedidos", label: "Pedidos", icon: ShoppingBag },
  encomendas: { to: "/painel/encomendas", label: "Encomendas", icon: ClipboardList },
  pdv: { to: "/pdv", label: "PDV / Caixa", icon: Store },
  salao: { to: "/painel/salao", label: "Mesas", icon: Armchair },
  kds: { to: "/kds", label: "KDS", icon: MonitorPlay },
  agendamentos: { to: "/painel/agendamentos", label: "Agenda", icon: CalendarClock },
  produtos: { to: "/painel/produtos", label: "Catálogo", icon: Package },
  estoque: { to: "/painel/estoque", label: "Estoque", icon: Boxes },
  digitais: { to: "/painel/digitais", label: "Produtos digitais", icon: Download },
  personalizar: { to: "/painel/personalizar", label: "Personalizar loja", icon: Paintbrush },
  entregas: { to: "/painel/entregas", label: "Entregas", icon: Bike },
  entregadores: { to: "/painel/entregadores", label: "Entregadores", icon: Bike },
  frete: { to: "/painel/frete", label: "Frete e áreas", icon: Bike },
  clientes: { to: "/painel/clientes", label: "Clientes", icon: Users },
  avaliacoes: { to: "/painel/avaliacoes", label: "Avaliações", icon: Star },
  promocoes: { to: "/painel/promocoes", label: "Marketing", icon: Tag },
  fidelidade: { to: "/painel/fidelidade", label: "Fidelidade e CRM", icon: Gift },
  relatorios: { to: "/painel/relatorios", label: "Relatórios", icon: BarChart3 },
  pagamentos: { to: "/painel/pagamentos", label: "Financeiro", icon: CreditCard },
  whatsapp: { to: "/painel/whatsapp", label: "WhatsApp da loja", icon: MessageSquare },
  impressao: { to: "/painel/impressao", label: "Impressão", icon: Printer },
  integracoes: { to: "/painel/integracoes", label: "Integrações e API", icon: Plug },
  equipe: { to: "/painel/equipe", label: "Equipe", icon: UserCog },
  assinatura: { to: "/painel/assinatura", label: "Assinatura", icon: Sparkles },
  privacidade: { to: "/painel/privacidade", label: "Privacidade", icon: ShieldCheck },
  configuracoes: { to: "/painel/configuracoes", label: "Configurações", icon: Settings },
  suporte: { to: "/painel/suporte", label: "Suporte", icon: LifeBuoy },
};

function PainelLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { memberships, active, selectStore, isLoading } = useActiveStore();
  const { data: config } = useStoreFeatures(active?.storeId, active?.store.segment);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const subscriptionQuery = useSubscription(active?.storeId);
  const plan = subscriptionQuery.data?.plan ?? null;
  const planLoaded = !subscriptionQuery.isLoading;

  const enabled = config?.features ?? [];
  /** Um módulo aparece no menu quando o ramo o ativa E o plano o libera. */
  const allowsModule = useCallback(
    (key: FeatureKey) => {
      if (config && !isFeatureEnabled(enabled, key)) return false;
      if (!planLoaded || !plan) return true;
      return planAllowsModule(plan, key);
    },
    [config, enabled, plan, planLoaded],
  );

  const groups = FEATURE_GROUPS.map((group) => ({
    title: group.title,
    items: group.keys.filter(allowsModule).map((key) => NAV[key]),
  })).filter((group) => group.items.length > 0);

  useEffect(() => {
    if (!config) return;
    const entry = (Object.entries(NAV) as [FeatureKey, { to: string }][]).find(
      ([, item]) => item.to !== "/painel" && pathname.startsWith(item.to),
    );
    if (!entry) return;
    const key = entry[0];
    if (allowsModule(key)) return;
    const blockedByPlan = planLoaded && plan !== null && !planAllowsModule(plan, key);
    toast.info(
      blockedByPlan
        ? `${FEATURE_LABEL[key]} não está incluído no plano ${plan?.name ?? "atual"}.`
        : `${FEATURE_LABEL[key]} está desativado para o seu ramo de atividade.`,
    );
    void navigate({ to: blockedByPlan ? "/painel/assinatura" : "/painel", replace: true });
  }, [config, allowsModule, plan, planLoaded, pathname, navigate]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", search: { modo: "entrar" }, replace: true });
  }


  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Página inicial">
            <Logo withWordmark={false} />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {memberships.length > 0 ? (
              <Select value={active?.storeId ?? ""} onValueChange={selectStore}>
                <SelectTrigger className="w-full max-w-64" aria-label="Selecionar loja">
                  <SelectValue placeholder="Selecione a loja" />
                </SelectTrigger>
                <SelectContent>
                  {memberships.map((item) => (
                    <SelectItem key={item.storeId} value={item.storeId}>
                      {item.store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {active?.store.is_demo ? <DemoBadge /> : null}
          </div>
          <div className="flex items-center gap-2">
            {active ? (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {ROLE_LABEL[active.role]}
              </span>
            ) : null}
            <StorePauseButton storeId={active?.storeId} />
            <NotificationCenter storeId={active?.storeId} />
            <ThemeToggle />

            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 size-4" aria-hidden="true" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <nav aria-label="Menu do painel" className="lg:w-56 lg:shrink-0">
          <div className="flex gap-4 overflow-x-auto pb-2 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0">
            {groups.map((group) => (
              <div key={group.title} className="shrink-0">
                <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:block">
                  {group.title}
                </p>
                <ul className="flex gap-2 lg:flex-col">
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <Link
                        to={item.to as never}
                        activeOptions={{ exact: item.to === "/painel" }}
                        activeProps={{
                          className: "bg-primary text-primary-foreground hover:bg-primary/90",
                        }}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <item.icon className="size-4" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>


        <main className="min-w-0 flex-1">
          {!isLoading && memberships.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <h1 className="text-lg font-semibold text-foreground">Você ainda não tem uma loja</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Crie sua loja para começar a receber pedidos e agendamentos.
              </p>
              <Button asChild className="mt-6 bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/onboarding">Criar minha loja</Link>
              </Button>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
