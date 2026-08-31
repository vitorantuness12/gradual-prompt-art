import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, KeyRound, Link2, Loader2, Trash2, Users } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_MEMBER_PASSWORD, memberAreaUrl } from "@/lib/membros";
import {
  excluirMaterial,
  listarMateriais,
  listarMembros,
  redefinirSenhaMembro,
  salvarMaterial,
} from "@/lib/membros.functions";
import { PUBLIC_STORE_BASE_URL } from "@/lib/store-url";

const BUCKET = "produtos-digitais";
const MAX_FILE_MB = 200;

export interface MembrosTabProps {
  storeId: string;
  slug: string;
}

/**
 * Aba "Área de membros": hospedagem dos materiais por produto e gestão das
 * contas de acesso dos compradores.
 */
export function MembrosTab({ storeId, slug }: MembrosTabProps) {
  const areaUrl = memberAreaUrl(PUBLIC_STORE_BASE_URL, slug);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <ResourcesCard storeId={storeId} />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endereço da área de membros</CardTitle>
            <CardDescription>
              É este link que o comprador recebe por e-mail junto com a senha padrão{" "}
              <strong>{DEFAULT_MEMBER_PASSWORD}</strong>, com o pedido de trocá-la no primeiro acesso.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{areaUrl}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(areaUrl);
                toast.success("Link copiado.");
              }}
            >
              Copiar
            </Button>
          </CardContent>
        </Card>
        <AccountsCard storeId={storeId} />
      </div>
    </div>
  );
}

/* ------------------------------- Materiais -------------------------------- */

function ResourcesCard({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const fetchResources = useServerFn(listarMateriais);
  const persist = useServerFn(salvarMaterial);
  const remove = useServerFn(excluirMaterial);
  const fileInput = useRef<HTMLInputElement>(null);

  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"file" | "link">("file");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["membros-produtos", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("store_id", storeId)
        .in("kind", ["digital", "subscription"])
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const selected = productId || products[0]?.id || "";

  const resourcesQuery = useQuery({
    queryKey: ["membros-materiais", storeId, selected],
    enabled: Boolean(selected),
    queryFn: () => fetchResources({ data: { storeId, productId: selected } }),
  });

  const saveMutation = useMutation({
    mutationFn: (input: { title: string; kind: "file" | "link"; url?: string | null; filePath?: string | null }) =>
      persist({ data: { storeId, productId: selected, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setTitle("");
      setUrl("");
      if (fileInput.current) fileInput.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["membros-materiais", storeId, selected] });
    },
    onError: () => toast.error("Não foi possível salvar o material."),
  });

  const removeMutation = useMutation({
    mutationFn: (resourceId: string) => remove({ data: { storeId, resourceId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["membros-materiais", storeId, selected] });
    },
    onError: () => toast.error("Não foi possível remover o material."),
  });

  /** Envia o arquivo para a pasta da loja e salva o material apontando para ele. */
  async function handleUpload() {
    const file = fileInput.current?.files?.[0];
    if (!selected) {
      toast.error("Escolha o produto digital.");
      return;
    }
    if (!file) {
      toast.error("Escolha um arquivo para enviar.");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`O arquivo passa de ${MAX_FILE_MB}MB.`);
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${storeId}/${selected}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (error) {
        toast.error("Falha ao enviar o arquivo. Tente novamente.");
        return;
      }
      await saveMutation.mutateAsync({ title: title.trim() || file.name, kind: "file", filePath: path });
    } finally {
      setUploading(false);
    }
  }

  const resources = resourcesQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Materiais hospedados</CardTitle>
        <CardDescription>
          Envie os arquivos aqui. O cliente baixa por um link temporário gerado no momento do acesso — o endereço nunca
          fica público.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label>Produto digital</Label>
          <Select value={selected} onValueChange={setProductId}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um produto" />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {products.length === 0 && !productsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">
              Cadastre um produto do tipo digital ou assinatura em Produtos para hospedar materiais.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 rounded-xl border border-border p-3">
          <div className="grid gap-2">
            <Label htmlFor="material-title">Nome do material</Label>
            <Input
              id="material-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex.: Apostila completa em PDF"
            />
          </div>
          <div className="grid gap-2">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(value) => setKind(value === "link" ? "link" : "file")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="file">Arquivo hospedado aqui</SelectItem>
                <SelectItem value="link">Link externo (aula, drive, comunidade)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "file" ? (
            <div className="grid gap-2">
              <Label htmlFor="material-file">Arquivo (até {MAX_FILE_MB}MB)</Label>
              <Input id="material-file" ref={fileInput} type="file" />
              <Button
                type="button"
                onClick={() => void handleUpload()}
                disabled={uploading || saveMutation.isPending || !selected}
              >
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                Enviar e publicar
              </Button>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="material-url">Link</Label>
              <Input
                id="material-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://..."
              />
              <Button
                type="button"
                onClick={() => saveMutation.mutate({ title, kind: "link", url })}
                disabled={saveMutation.isPending || !selected}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Publicar link
              </Button>
            </div>
          )}
        </div>

        {resourcesQuery.isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : resources.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum material publicado para este produto ainda.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {resources.map((resource) => (
              <li key={resource.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{resource.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {resource.kind === "link" ? "Link externo" : "Arquivo hospedado"} ·{" "}
                    {formatDateTime(resource.createdAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${resource.title}`}
                  onClick={() => removeMutation.mutate(resource.id)}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- Contas --------------------------------- */

function AccountsCard({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const fetchMembers = useServerFn(listarMembros);
  const resetPassword = useServerFn(redefinirSenhaMembro);

  const membersQuery = useQuery({
    queryKey: ["membros-contas", storeId],
    queryFn: () => fetchMembers({ data: { storeId } }),
  });

  const resetMutation = useMutation({
    mutationFn: (memberId: string) => resetPassword({ data: { storeId, memberId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["membros-contas", storeId] });
    },
    onError: () => toast.error("Não foi possível redefinir a senha."),
  });

  const members = membersQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Contas de acesso
        </CardTitle>
        <CardDescription>Criadas automaticamente quando o pagamento do produto digital é confirmado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {membersQuery.isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conta criada ainda.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.lastLoginAt ? `Último acesso: ${formatDateTime(member.lastLoginAt)}` : "Nunca acessou"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {member.mustChangePassword ? <Badge variant="secondary">Senha padrão</Badge> : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => resetMutation.mutate(member.id)}
                    disabled={resetMutation.isPending}
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    Redefinir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
