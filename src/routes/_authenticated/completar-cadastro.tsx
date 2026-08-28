import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchAccountKinds } from "@/hooks/useAccountKinds";
import { ACCOUNT_KINDS, VEHICLE_TYPES, type AccountKind } from "@/lib/contas";
import { applyPendingProfile, persistProfile } from "@/lib/contas-pending";
import { isValidDocument, isValidPhone, maskDocument, maskPhone, onlyDigits } from "@/lib/masks";

export const Route = createFileRoute("/_authenticated/completar-cadastro")({
  head: () => ({
    meta: [
      { title: "Completar cadastro — O Seu Pedido" },
      {
        name: "description",
        content: "Finalize seu cadastro escolhendo o perfil de cliente, motoboy ou lojista.",
      },
      { property: "og:title", content: "Completar cadastro" },
      { property: "og:description", content: "Escolha seu perfil e conclua o cadastro na plataforma." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompleteSignupPage,
});

function CompleteSignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<AccountKind>("cliente");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [vehicleType, setVehicleType] = useState("moto");
  const [pixKey, setPixKey] = useState("");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      setEmail(user.email ?? "");
      const meta = user.user_metadata as { full_name?: string; phone?: string };
      setFullName(meta.full_name ?? "");
      setPhone(meta.phone ? maskPhone(meta.phone) : "");

      const applied = await applyPendingProfile(user.id);
      if (applied) {
        await queryClient.invalidateQueries({ queryKey: ["account-kinds"] });
        toast.success("Cadastro concluído!");
        void navigate({
          to:
            applied.kind === "lojista"
              ? "/onboarding"
              : applied.kind === "motoboy"
                ? "/entregador/status"
                : "/minha-conta",
          replace: true,
        });
        return;
      }
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fullName.trim().length < 3) { toast.error("Informe seu nome completo."); return; }
    if (!isValidPhone(phone)) { toast.error("Informe um telefone válido com DDD."); return; }
    if (kind !== "cliente" && !isValidDocument(document)) {
      toast.error(kind === "motoboy" ? "Informe um CPF válido." : "Informe um CPF ou CNPJ válido.");
      return;
    }
    if (kind === "motoboy" && (!city.trim() || !pixKey.trim())) {
      toast.error("Informe a cidade de atuação e a chave Pix.");
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) { toast.error("Sessão expirada. Entre novamente."); return; }

    setLoading(true);
    await persistProfile(data.user.id, {
      kind,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: onlyDigits(phone),
      birthDate: birthDate || null,
      document: onlyDigits(document) || null,
      cpf: onlyDigits(document) || null,
      city: city.trim() || null,
      region: region.trim() || null,
      vehicleType,
      pixKey: pixKey.trim() || null,
      pixKeyType: "chave",
    });
    await queryClient.invalidateQueries({ queryKey: ["account-kinds"] });
    const kinds = await fetchAccountKinds();
    setLoading(false);
    toast.success("Perfil criado com sucesso!");

    if (kind === "lojista") { void navigate({ to: "/onboarding", replace: true }); return; }
    if (kind === "motoboy") { void navigate({ to: "/entregador/status", replace: true }); return; }
    void navigate({ to: kinds.customer ? "/minha-conta" : "/escolher-perfil", replace: true });
  }

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-xl px-4 pb-16 sm:px-6">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl font-semibold">Completar cadastro</h1>
            </CardTitle>
            <CardDescription>
              Escolha o perfil que você quer usar. Você pode adicionar outros perfis depois, sem criar
              outra conta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {checking ? (
              <p className="text-sm text-muted-foreground">Carregando seus dados...</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ACCOUNT_KINDS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setKind(item.key)}
                      className={`rounded-xl border p-3 text-left text-sm transition ${
                        kind === item.key ? "border-primary bg-primary/5" : "border-border/70"
                      }`}
                    >
                      <span className="font-medium">{item.label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cc-nome">Nome completo</Label>
                  <Input id="cc-nome" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-tel">Telefone com DDD</Label>
                  <Input
                    id="cc-tel"
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    inputMode="tel"
                    required
                  />
                </div>

                {kind === "cliente" ? (
                  <div className="space-y-2">
                    <Label htmlFor="cc-nasc">Data de nascimento (opcional)</Label>
                    <Input id="cc-nasc" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="cc-doc">{kind === "motoboy" ? "CPF" : "CPF ou CNPJ"}</Label>
                    <Input
                      id="cc-doc"
                      value={document}
                      onChange={(e) => setDocument(maskDocument(e.target.value))}
                      inputMode="numeric"
                      required
                    />
                  </div>
                )}

                {kind === "motoboy" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cc-cidade">Cidade de atuação</Label>
                      <Input id="cc-cidade" value={city} onChange={(e) => setCity(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cc-regiao">Região</Label>
                      <Input id="cc-regiao" value={region} onChange={(e) => setRegion(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cc-veiculo">Veículo</Label>
                      <Select value={vehicleType} onValueChange={setVehicleType}>
                        <SelectTrigger id="cc-veiculo">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VEHICLE_TYPES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cc-pix">Chave Pix</Label>
                      <Input id="cc-pix" value={pixKey} onChange={(e) => setPixKey(e.target.value)} required />
                    </div>
                  </div>
                ) : null}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Salvando..." : "Concluir cadastro"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
