import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, History, Monitor, Redo2, RotateCcw, Save, Smartphone, Tablet, Undo2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EntryPopupsTab } from "@/components/painel/editor/EntryPopupsTab";
import { SectionReorderList } from "@/components/painel/editor/SectionReorderList";
import { StorePreview, type PreviewDevice } from "@/components/painel/editor/StorePreview";
import { ThemeEditorSidebar } from "@/components/painel/editor/ThemeEditorSidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveStore } from "@/hooks/useMyStores";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  defaultThemeConfig,
  defaultSections,
  parseScheduleRule,
  parseThemeConfig,
  type StoreSectionDraft,
  type StoreThemeConfig,
} from "@/lib/store-theme";
import {
  editorAppearanceQuery,
  publishDraft,
  saveDraft,
  versionToDraft,
  type StoreThemeVersionRow,
} from "@/lib/store-theme-queries";

export const Route = createFileRoute("/_authenticated/painel/personalizar")({
  component: PersonalizarPage,
});

interface EditorState {
  config: StoreThemeConfig;
  sections: StoreSectionDraft[];
}

function PersonalizarPage() {
  const { active, isLoading: loadingStores } = useActiveStore();
  const storeId = active?.storeId ?? null;
  const queryClient = useQueryClient();
  const query = useQuery(editorAppearanceQuery(storeId));

  const [state, setState] = useState<EditorState | null>(null);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [tab, setTab] = useState("visual");
  const history = useRef<{ past: EditorState[]; future: EditorState[] }>({ past: [], future: [] });
  const [historyTick, setHistoryTick] = useState(0);

  // Carrega o rascunho salvo assim que os dados chegam.
  useEffect(() => {
    if (!query.data || state) return;
    const sections = query.data.sections.length
      ? query.data.sections.map((row) => ({
          block_key: row.block_key,
          title: row.title,
          subtitle: row.subtitle,
          image_url: row.image_url,
          accent_color: row.accent_color,
          sort_order: row.sort_order,
          is_visible: row.is_visible,
          schedule_rule: parseScheduleRule(row.schedule_rule),
        }))
      : defaultSections();
    setState({
      config: query.data.theme ? parseThemeConfig(query.data.theme.draft_config) : defaultThemeConfig(),
      sections,
    });
  }, [query.data, state]);

  function commit(next: EditorState) {
    if (state) {
      history.current.past = [...history.current.past.slice(-29), state];
      history.current.future = [];
    }
    setState(next);
    setHistoryTick((tick) => tick + 1);
  }

  function undo() {
    const previous = history.current.past.pop();
    if (!previous || !state) return;
    history.current.future = [state, ...history.current.future];
    setState(previous);
    setHistoryTick((tick) => tick + 1);
  }

  function redo() {
    const [next, ...rest] = history.current.future;
    if (!next || !state) return;
    history.current.past = [...history.current.past, state];
    history.current.future = rest;
    setState(next);
    setHistoryTick((tick) => tick + 1);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!storeId || !state) throw new Error("Sem loja ativa");
      await saveDraft(storeId, state.config, state.sections);
    },
    onSuccess: () => {
      toast.success("Rascunho salvo. Seus clientes ainda veem a versão publicada.");
      void queryClient.invalidateQueries({ queryKey: ["store-editor", storeId] });
    },
    onError: () => toast.error("Não foi possível salvar o rascunho."),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!storeId || !state) throw new Error("Sem loja ativa");
      await publishDraft(storeId, state.config, state.sections, `Publicado em ${formatDateTime(new Date())}`);
    },
    onSuccess: () => {
      toast.success("Loja publicada com o novo visual.");
      void queryClient.invalidateQueries({ queryKey: ["store-editor", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["store-appearance"] });
    },
    onError: () => toast.error("Não foi possível publicar as alterações."),
  });

  const versions: StoreThemeVersionRow[] = query.data?.versions ?? [];
  const unpublished = query.data?.theme?.has_unpublished_changes ?? false;
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  void historyTick;

  const previewProducts = useMemo(
    () =>
      (query.data?.products ?? []).map((product) => ({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        promo_price: product.promo_price === null ? null : Number(product.promo_price),
      })),
    [query.data?.products],
  );

  if (loadingStores || query.isLoading || !state) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[28rem] w-full" />
      </div>
    );
  }

  if (!active) {
    return <p className="text-sm text-muted-foreground">Selecione uma loja para personalizar.</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Personalizar loja</h1>
          <p className="text-sm text-muted-foreground">
            Ajuste cores, blocos e textos. As mudanças ficam em rascunho até você publicar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unpublished ? <Badge variant="secondary">Rascunho não publicado</Badge> : null}
          <Button variant="outline" size="icon" onClick={undo} disabled={!canUndo} aria-label="Desfazer">
            <Undo2 className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" onClick={redo} disabled={!canRedo} aria-label="Refazer">
            <Redo2 className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-2 size-4" aria-hidden="true" /> Salvar rascunho
          </Button>
          <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
            <Upload className="mr-2 size-4" aria-hidden="true" /> Publicar
          </Button>
          <Button variant="ghost" asChild>
            <a href={`/${active.store.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 size-4" aria-hidden="true" /> Ver loja
            </a>
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="visual">Visual</TabsTrigger>
          <TabsTrigger value="blocos">Blocos</TabsTrigger>
          <TabsTrigger value="janelas">Janelas de entrada</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="janelas" className="mt-4">
          <EntryPopupsTab storeId={active.storeId} storeSlug={active.store.slug} theme={state.config} />
        </TabsContent>
      </Tabs>

      <div
        className={cn(
          "grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]",
          tab === "janelas" && "hidden",
        )}
      >
        <Card>
          <CardContent className="pt-6">
            <Tabs value={tab} onValueChange={setTab}>

              <TabsContent value="visual" className="mt-4">
                <ThemeEditorSidebar
                  config={state.config}
                  storeId={active.storeId}
                  onChange={(config) => commit({ ...state, config })}
                />
              </TabsContent>

              <TabsContent value="blocos" className="mt-4">
                <SectionReorderList
                  sections={state.sections}
                  onChange={(sections) => commit({ ...state, sections })}
                />
              </TabsContent>

              <TabsContent value="historico" className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Cada publicação vira uma versão. Restaurar traz a versão para o rascunho — você ainda precisa publicar.
                </p>
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma publicação registrada ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {versions.map((version) => (
                      <li key={version.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{version.label}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(version.created_at)}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const restored = versionToDraft(version);
                            commit({
                              config: restored.config,
                              sections: restored.sections.length ? restored.sections : state.sections,
                            });
                            toast.success("Versão carregada no rascunho.");
                          }}
                        >
                          <RotateCcw className="mr-2 size-4" aria-hidden="true" /> Restaurar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <History className="size-3" aria-hidden="true" /> Guardamos as 20 publicações mais recentes.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Pré-visualização</CardTitle>
            <div className="flex gap-1">
              {(
                [
                  ["desktop", Monitor, "Computador"],
                  ["tablet", Tablet, "Tablet"],
                  ["mobile", Smartphone, "Celular"],
                ] as const
              ).map(([key, Icon, label]) => (
                <Button
                  key={key}
                  variant={device === key ? "default" : "outline"}
                  size="icon"
                  onClick={() => setDevice(key)}
                  aria-label={label}
                  aria-pressed={device === key}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <StorePreview
              config={state.config}
              sections={state.sections}
              device={device}
              storeName={active.store.name}
              storeSlug={active.store.slug}
              products={previewProducts}
              categories={query.data?.categories ?? []}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
