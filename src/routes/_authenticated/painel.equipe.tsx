import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/painel/PageHeader";
import { PermissionMatrix } from "@/components/painel/PermissionMatrix";
import { LimitGate, LimitMeter } from "@/components/painel/LimitGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { canManage, useActiveStore } from "@/hooks/useMyStores";
import { supabase } from "@/integrations/supabase/client";
import { createStoreInvite } from "@/lib/equipe.functions";
import { ROLE_LABEL, formatDate } from "@/lib/format";
import {
  ASSIGNABLE_ROLES,
  PERMISSION_AREAS,
  ROLE_DEFAULT_PERMISSIONS,
  normalizePermissions,
  permissionSummary,
  type PermissionMap,
} from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/painel/equipe")({
  component: TeamPage,
  head: () => ({
    meta: [
      { title: "Equipe da loja | O Seu Pedido" },
      {
        name: "description",
        content: "Convide pessoas, defina papéis e permissões por área do painel.",
      },
    ],
  }),
});

function TeamPage() {
  const { active } = useActiveStore();
  const storeId = active?.storeId;
  const manager = canManage(active?.role);
  const queryClient = useQueryClient();
  const inviteFn = useServerFn(createStoreInvite);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ASSIGNABLE_ROLES)[number]>("staff");
  const [permissions, setPermissions] = useState<PermissionMap>(
    ROLE_DEFAULT_PERMISSIONS["staff"] ?? {},
  );
  const [expiresInDays, setExpiresInDays] = useState(7);

  const membersQuery = useQuery({
    queryKey: ["store-members", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_members")
        .select("id, user_id, role, permissions, is_active, created_at")
        .eq("store_id", storeId!)
        .order("created_at");
      if (error) throw new Error(error.message);

      const ids = (data ?? []).map((row) => row.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as { id: string; full_name: string | null }[] };
      const names = new Map((profiles ?? []).map((row) => [row.id, row.full_name]));

      return (data ?? []).map((row) => ({ ...row, fullName: names.get(row.user_id) ?? null }));
    },
  });

  const invitesQuery = useQuery({
    queryKey: ["store-invites", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_invites")
        .select("id, email, role, status, expires_at, created_at, token")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const auditQuery = useQuery({
    queryKey: ["team-audit", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity, metadata, created_at")
        .eq("store_id", storeId!)
        .in("action", [
          "invite.created",
          "invite.accepted",
          "invite.revoked",
          "member.updated",
          "member.deactivated",
        ])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Selecione uma loja.");
      return inviteFn({
        data: {
          storeId,
          email,
          role,
          permissions: permissions as Record<string, boolean>,
          expiresInDays,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["store-invites", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["team-audit", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMember = useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown>; action: string }) => {
      const { error } = await supabase
        .from("store_members")
        .update(input.patch as never)
        .eq("id", input.id);
      if (error) throw new Error(error.message);
      if (storeId) {
        await supabase.from("audit_logs").insert({
          store_id: storeId,
          action: input.action,
          entity: "store_members",
          entity_id: input.id,
          metadata: input.patch as never,
        });
      }
    },
    onSuccess: () => {
      toast.success("Equipe atualizada.");
      void queryClient.invalidateQueries({ queryKey: ["store-members", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["team-audit", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("store_invites")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      if (storeId) {
        await supabase.from("audit_logs").insert({
          store_id: storeId,
          action: "invite.revoked",
          entity: "store_invites",
          entity_id: id,
          metadata: {},
        });
      }
    },
    onSuccess: () => {
      toast.success("Convite cancelado.");
      void queryClient.invalidateQueries({ queryKey: ["store-invites", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["team-audit", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleRoleChange(next: string) {
    const value = next as (typeof ASSIGNABLE_ROLES)[number];
    setRole(value);
    setPermissions(ROLE_DEFAULT_PERMISSIONS[value] ?? {});
  }

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (!email.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    inviteMutation.mutate();
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/convite/${token}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link do convite copiado.");
  }

  if (!manager) {
    return (
      <EmptyState
        title="Acesso restrito"
        description="Somente proprietários e gerentes podem administrar a equipe da loja."
      />
    );
  }

  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const pending = invites.filter((invite) => invite.status === "pending");

  return (
    <div>
      <PageHeader
        title="Equipe da loja"
        description="Convide pessoas por e-mail, defina o papel e libere apenas as áreas necessárias."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                <UserPlus className="mr-2 size-4" aria-hidden="true" />
                Convidar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Convidar pessoa</DialogTitle>
                <DialogDescription>
                  O convite expira automaticamente e só pode ser aceito pelo e-mail informado.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={submitInvite}>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">E-mail</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="pessoa@email.com"
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Papel</Label>
                    <Select value={role} onValueChange={handleRoleChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {ROLE_LABEL[item]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-expira">Expira em (dias)</Label>
                    <Input
                      id="invite-expira"
                      type="number"
                      min={1}
                      max={30}
                      value={expiresInDays}
                      onChange={(event) => setExpiresInDays(Number(event.target.value) || 7)}
                    />
                  </div>
                </div>

                <fieldset className="space-y-2 rounded-xl border border-border p-3">
                  <legend className="px-1 text-xs font-medium text-muted-foreground">
                    Permissões por área
                  </legend>
                  {role === "owner" || role === "manager" ? (
                    <p className="text-sm text-muted-foreground">
                      Proprietários e gerentes têm acesso completo a todas as áreas.
                    </p>
                  ) : (
                    PERMISSION_AREAS.map((area) => (
                      <div key={area.key} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{area.label}</p>
                          <p className="text-xs text-muted-foreground">{area.description}</p>
                        </div>
                        <Switch
                          checked={Boolean(permissions[area.key])}
                          onCheckedChange={(checked) =>
                            setPermissions((current) => ({ ...current, [area.key]: checked }))
                          }
                          aria-label={area.label}
                        />
                      </div>
                    ))
                  )}
                </fieldset>

                <Button type="submit" className="w-full" disabled={inviteMutation.isPending}>
                  <Mail className="mr-2 size-4" aria-hidden="true" />
                  {inviteMutation.isPending ? "Enviando..." : "Enviar convite"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4">
        <LimitMeter storeId={storeId} limitKey="users" />
      </div>

      <LimitGate storeId={storeId} limitKey="users" action="adicionar mais pessoas na equipe">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Membros ({members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {membersQuery.isLoading ? (
              <Skeleton className="h-24 rounded-xl" />
            ) : members.length === 0 ? (
              <EmptyState title="Nenhum membro ainda" />
            ) : (
              <ul className="divide-y divide-border">
                {members.map((member) => {
                  const perms = normalizePermissions(member.permissions);
                  return (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {member.fullName ?? "Membro da equipe"}
                          {member.is_active ? null : (
                            <Badge variant="secondary" className="ml-2">
                              Desativado
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ROLE_LABEL[member.role]} · {permissionSummary(member.role, perms)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            updateMember.mutate({
                              id: member.id,
                              patch: {
                                role: value,
                                permissions: ROLE_DEFAULT_PERMISSIONS[value] ?? {},
                              },
                              action: "member.updated",
                            })
                          }
                        >
                          <SelectTrigger className="h-9 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((item) => (
                              <SelectItem key={item} value={item}>
                                {ROLE_LABEL[item]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateMember.mutate({
                              id: member.id,
                              patch: {
                                is_active: !member.is_active,
                                deactivated_at: member.is_active ? new Date().toISOString() : null,
                              },
                              action: member.is_active ? "member.deactivated" : "member.updated",
                            })
                          }
                        >
                          {member.is_active ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </LimitGate>

      <Card className="mt-6 border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Convites pendentes ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <EmptyState title="Nenhum convite enviado" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[invite.role]} · expira em {formatDate(invite.expires_at)} ·{" "}
                      {invite.status === "pending" ? "aguardando" : invite.status}
                    </p>
                  </div>
                  {invite.status === "pending" ? (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyLink(invite.token)}>
                        <Copy className="mr-2 size-4" aria-hidden="true" />
                        Copiar link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeInvite.mutate(invite.id)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Auditoria da equipe
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(auditQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(auditQuery.data ?? []).map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3">
                  <span className="text-foreground">{log.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(log.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="mt-6">
        <PermissionMatrix />
      </section>
    </div>
  );
}
