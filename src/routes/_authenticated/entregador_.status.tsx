import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Clock, FileUp, LogOut, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  COURIER_DOCUMENT_KINDS,
  COURIER_STATUS_LABEL,
  courierCanWork,
  maskSensitive,
} from "@/lib/contas";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/entregador_/status")({
  head: () => ({
    meta: [
      { title: "Status do cadastro de entregador — O Seu Pedido" },
      {
        name: "description",
        content:
          "Acompanhe a análise do seu cadastro de motoboy, envie documentos e veja seus ganhos e lojas vinculadas.",
      },
      { property: "og:title", content: "Status do cadastro de entregador" },
      { property: "og:description", content: "Envie documentos e acompanhe a aprovação do seu cadastro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CourierStatusPage,
});

const MAX_FILE_MB = 5;

function CourierStatusPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState(COURIER_DOCUMENT_KINDS[0]!.value);
  const [file, setFile] = useState<File | null>(null);

  const profileQuery = useQuery({
    queryKey: ["delivery-profile"],
    queryFn: async () => {
      const { data } = await supabase.from("delivery_profiles").select("*").maybeSingle();
      return data;
    },
  });

  const documentsQuery = useQuery({
    queryKey: ["delivery-documents"],
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_documents")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const earningsQuery = useQuery({
    queryKey: ["delivery-earnings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_earnings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const linksQuery = useQuery({
    queryKey: ["courier-store-links"],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_couriers")
        .select("*, store:stores(name, slug)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Escolha um arquivo.");
      if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Arquivo maior que ${MAX_FILE_MB} MB.`);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada.");

      const path = `entregadores/${userId}/${kind}-${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("store-images").upload(path, file);
      if (uploadError) throw new Error(uploadError.message);

      const { error } = await supabase.from("delivery_documents").insert({
        courier_user_id: userId,
        kind,
        file_path: path,
        status: "pending",
      });
      if (error) throw new Error(error.message);

      await supabase
        .from("delivery_profiles")
        .update({ status: "awaiting_approval" })
        .eq("user_id", userId);
    },
    onSuccess: () => {
      toast.success("Documento enviado para análise.");
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ["delivery-documents"] });
      void queryClient.invalidateQueries({ queryKey: ["delivery-profile"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const answerInvite = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase
        .from("store_couriers")
        .update({ status: accept ? "approved" : "removed" })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Convite atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["courier-store-links"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", search: { etapa: "entrar" }, replace: true });
  }

  const profile = profileQuery.data;
  const canWork = courierCanWork(profile?.status);
  const balance = (earningsQuery.data ?? [])
    .filter((item) => item.status !== "paid")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-6 sm:px-6">
        <Logo />
        <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden /> Sair
        </Button>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-16 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Seu cadastro de entregador</h1>
          <p className="mt-1 text-muted-foreground">
            As entregas são liberadas somente após a aprovação dos documentos.
          </p>
        </div>

        {profileQuery.isLoading ? (
          <Skeleton className="h-32" />
        ) : !profile ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="font-medium">Você ainda não tem cadastro de entregador.</p>
              <Button asChild>
                <Link to="/completar-cadastro">Criar cadastro de motoboy</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">Situação atual</CardTitle>
                  <CardDescription>
                    {canWork
                      ? "Cadastro aprovado. Você já pode ficar online e receber entregas."
                      : "Estamos analisando seus dados e documentos."}
                  </CardDescription>
                </div>
                <Badge variant={canWork ? "default" : "secondary"} className="whitespace-nowrap">
                  {canWork ? (
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Clock className="mr-1 h-3.5 w-3.5" aria-hidden />
                  )}
                  {COURIER_STATUS_LABEL[profile.status] ?? profile.status}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Nome:</span> {profile.full_name}
                </p>
                <p>
                  <span className="text-muted-foreground">CPF:</span> {maskSensitive(profile.cpf)}
                </p>
                <p>
                  <span className="text-muted-foreground">Cidade/região:</span> {profile.city ?? "—"}
                  {profile.region ? ` · ${profile.region}` : ""}
                </p>
                <p>
                  <span className="text-muted-foreground">Veículo:</span> {profile.vehicle_type}
                  {profile.plate ? ` · ${profile.plate}` : ""}
                </p>
                <p>
                  <span className="text-muted-foreground">Chave Pix:</span> {maskSensitive(profile.pix_key)}
                </p>
                <p>
                  <span className="text-muted-foreground">Saldo a receber:</span> {formatCurrency(balance)}
                </p>
                {profile.rejection_reason ? (
                  <p className="sm:col-span-2 rounded-lg bg-destructive/10 p-3 text-destructive">
                    Motivo da recusa: {profile.rejection_reason}
                  </p>
                ) : null}
                {canWork ? (
                  <div className="sm:col-span-2">
                    <Button asChild>
                      <Link to="/entregador">Ir para minhas entregas</Link>
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Documentos</CardTitle>
                <CardDescription>
                  Envie imagens legíveis em JPG ou PNG, com até {MAX_FILE_MB} MB por arquivo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="doc-kind">Tipo de documento</Label>
                    <Select value={kind} onValueChange={setKind}>
                      <SelectTrigger id="doc-kind">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COURIER_DOCUMENT_KINDS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc-file">Arquivo</Label>
                    <Input
                      id="doc-file"
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </div>
                  <Button onClick={() => upload.mutate()} disabled={upload.isPending || !file}>
                    <FileUp className="mr-2 h-4 w-4" aria-hidden /> Enviar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {COURIER_DOCUMENT_KINDS.find((item) => item.value === kind)?.hint}
                </p>

                {documentsQuery.isLoading ? (
                  <Skeleton className="h-16" />
                ) : (documentsQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum documento enviado ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {(documentsQuery.data ?? []).map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between rounded-lg border border-border/70 p-3 text-sm"
                      >
                        <span>
                          {COURIER_DOCUMENT_KINDS.find((item) => item.value === doc.kind)?.label ?? doc.kind}
                          <span className="ml-2 text-muted-foreground">{formatDateTime(doc.created_at)}</span>
                        </span>
                        <Badge variant={doc.status === "approved" ? "default" : "secondary"}>
                          {doc.status === "approved"
                            ? "Aprovado"
                            : doc.status === "rejected"
                              ? "Recusado"
                              : "Em análise"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lojas e convites</CardTitle>
                <CardDescription>Você só recebe entregas das lojas em que está vinculado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {linksQuery.isLoading ? (
                  <Skeleton className="h-16" />
                ) : (linksQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum vínculo com lojas até o momento.</p>
                ) : (
                  (linksQuery.data ?? []).map((link) => (
                    <div
                      key={link.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {(link.store as { name: string } | null)?.name ?? "Loja"}
                        </p>
                        <p className="text-muted-foreground">
                          Comissão por entrega: {formatCurrency(Number(link.commission_amount))}
                          {link.region ? ` · ${link.region}` : ""}
                        </p>
                      </div>
                      {link.status === "invited" ? (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => answerInvite.mutate({ id: link.id, accept: true })}>
                            Aceitar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => answerInvite.mutate({ id: link.id, accept: false })}
                          >
                            Recusar
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="secondary">
                          {link.status === "approved"
                            ? "Vinculado"
                            : link.status === "blocked"
                              ? "Bloqueado"
                              : link.status === "removed"
                                ? "Encerrado"
                                : "Aguardando"}
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Extrato de ganhos</CardTitle>
                <CardDescription>Valores por entrega, ajustes e taxas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {earningsQuery.isLoading ? (
                  <Skeleton className="h-16" />
                ) : (earningsQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem lançamentos por enquanto.</p>
                ) : (
                  (earningsQuery.data ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-border/70 p-3 text-sm"
                    >
                      <span>
                        {item.kind === "delivery" ? "Entrega" : item.kind}
                        <span className="ml-2 text-muted-foreground">{formatDateTime(item.created_at)}</span>
                      </span>
                      <span className="font-medium">{formatCurrency(Number(item.amount))}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
