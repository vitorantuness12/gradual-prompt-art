import { useServerFn } from "@tanstack/react-start";
import { Loader2, LockKeyhole, Mail, MapPin, MessageCircle, Plus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { persistProfile } from "@/lib/contas-pending";
import {
  confirmCheckoutCode,
  getCheckoutCustomer,
  requestCheckoutCode,
  saveCheckoutAddress,
  type CheckoutCustomerSession,
} from "@/lib/checkout-customer.functions";
import { onlyDigits } from "@/lib/masks";

export interface CheckoutAddressValue {
  id?: string;
  label?: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
  district: string;
  city: string;
  state: string;
}

interface CheckoutCustomerAccessProps {
  open: boolean;
  storeSlug: string;
  needsAddress: boolean;
  initialAddress: CheckoutAddressValue;
  onOpenChange: (open: boolean) => void;
  onReady: (customer: CheckoutCustomerSession, address: CheckoutAddressValue | null) => void;
}

type View = "start" | "password" | "code" | "register" | "addresses" | "new-address";

export function CheckoutCustomerAccess(props: CheckoutCustomerAccessProps) {
  const loadCustomer = useServerFn(getCheckoutCustomer);
  const requestCode = useServerFn(requestCheckoutCode);
  const confirmCode = useServerFn(confirmCheckoutCode);
  const saveAddress = useServerFn(saveCheckoutAddress);
  const [view, setView] = useState<View>("start");
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState<CheckoutCustomerSession | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const [address, setAddress] = useState<CheckoutAddressValue>({ ...props.initialAddress, label: "Casa" });
  const [makeDefault, setMakeDefault] = useState(true);
  const [registration, setRegistration] = useState({ name: "", email: "", phone: "", password: "", confirm: "", terms: false, marketing: false });

  async function refreshCustomer() {
    try {
      const loaded = await loadCustomer();
      setCustomer(loaded);
      const preferred = loaded.addresses.find((item) => item.isDefault) ?? loaded.addresses[0];
      setSelectedAddress(preferred?.id ?? "");
      setView(props.needsAddress ? (preferred ? "addresses" : "new-address") : "addresses");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar sua conta.");
      setView("start");
    }
  }

  useEffect(() => {
    if (!props.open) return;
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void refreshCustomer();
    });
    // A abertura do modal é o único gatilho; refreshCustomer usa as props atuais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  async function passwordLogin(): Promise<void> {
    setBusy(true);
    const email = identifier.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast.error("E-mail ou senha incorretos."); return; }
    await refreshCustomer();
  }

  async function sendCode(): Promise<void> {
    if (!identifier.trim()) { toast.error(`Informe seu ${channel === "email" ? "e-mail" : "WhatsApp"}.`); return; }
    setBusy(true);
    const result = channel === "email"
      ? await supabase.auth.signInWithOtp({ email: identifier.trim().toLowerCase(), options: { shouldCreateUser: false } }).then(({ error }) => ({ ok: !error, message: error ? "Não foi possível enviar o código." : "Código enviado para seu e-mail." }))
      : await requestCode({ data: { storeSlug: props.storeSlug, identifier, channel } });
    setBusy(false);
    if (!result.ok) { toast.error(result.message); return; }
    toast.success(result.message);
    setView("code");
  }

  async function verifyCode(): Promise<void> {
    setBusy(true);
    if (channel === "email") {
      const { error } = await supabase.auth.verifyOtp({ email: identifier.trim().toLowerCase(), token: code, type: "email" });
      setBusy(false);
      if (error) { toast.error("Código inválido ou expirado."); return; }
    } else {
      const result = await confirmCode({ data: { storeSlug: props.storeSlug, identifier, channel, code } });
      if (!result.ok || !result.tokenHash) {
        setBusy(false);
        toast.error(result.message); return;
      }
      const { error } = await supabase.auth.verifyOtp({ token_hash: result.tokenHash, type: "magiclink" });
      setBusy(false);
      if (error) { toast.error("Não foi possível iniciar sua sessão."); return; }
    }
    await refreshCustomer();
  }

  async function register(): Promise<void> {
    if (registration.name.trim().length < 3 || !registration.email.includes("@") || onlyDigits(registration.phone).length < 10) { toast.error("Preencha nome, e-mail e WhatsApp válidos."); return; }
    if (registration.password.length < 8 || registration.password !== registration.confirm) { toast.error("Use uma senha de 8 caracteres e confirme corretamente."); return; }
    if (!registration.terms) { toast.error("Aceite os termos e a política de privacidade."); return; }
    setBusy(true);
    const email = registration.email.trim().toLowerCase();
    const pending = { kind: "cliente" as const, fullName: registration.name.trim(), email, phone: onlyDigits(registration.phone), birthDate: null, marketingOptIn: registration.marketing, document: null, cpf: null, city: null, region: null, vehicleType: "moto", vehicleBrand: null, vehicleModel: null, plate: null, cnhNumber: null, pixKey: null, pixKeyType: "chave" };
    const { data, error } = await supabase.auth.signUp({ email, password: registration.password, options: { emailRedirectTo: window.location.href, data: { full_name: pending.fullName, phone: pending.phone, account_kind: "cliente", terms_accepted_at: new Date().toISOString() } } });
    if (error) { setBusy(false); toast.error(error.message.includes("registered") ? "Este e-mail já possui cadastro." : "Não foi possível criar sua conta."); return; }
    if (!data.session || !data.user) { setBusy(false); toast.success("Confirme o e-mail enviado e volte para finalizar o pedido."); return; }
    await persistProfile(data.user.id, pending);
    setBusy(false);
    await refreshCustomer();
  }

  function finish(): void {
    if (!customer) return;
    if (!props.needsAddress) { props.onReady(customer, null); return; }
    const found = customer.addresses.find((item) => item.id === selectedAddress);
    if (!found) { toast.error("Escolha ou cadastre um endereço."); return; }
    props.onReady(customer, { id: found.id, label: found.label, zip: found.zipCode ?? "", street: found.street, number: found.number ?? "", complement: found.complement ?? "", reference: found.reference ?? "", district: found.district ?? "", city: found.city, state: found.state ?? "" });
  }

  async function createAddress(): Promise<void> {
    if (!address.street.trim() || !address.number.trim() || !address.city.trim()) { toast.error("Informe rua, número e cidade."); return; }
    setBusy(true);
    await saveAddress({ data: { label: address.label ?? "Casa", street: address.street, number: address.number, complement: address.complement, reference: address.reference, district: address.district, city: address.city, state: address.state, zipCode: address.zip, makeDefault } });
    setBusy(false);
    await refreshCustomer();
  }

  const field = (key: keyof CheckoutAddressValue, label: string, placeholder = "") => <div className="space-y-1.5"><Label>{label}</Label><Input value={address[key] ?? ""} placeholder={placeholder} onChange={(event) => setAddress((current) => ({ ...current, [key]: event.target.value }))} /></div>;

  return <Dialog open={props.open} onOpenChange={props.onOpenChange}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><LockKeyhole className="size-5" /> Acesse para finalizar</DialogTitle><DialogDescription>Seus dados e endereços ficam protegidos e prontos para os próximos pedidos.</DialogDescription></DialogHeader>
    {view === "start" && <div className="space-y-3"><Button className="w-full" onClick={() => { setChannel("email"); setView("password"); }}><Mail className="mr-2 size-4" /> Entrar com e-mail</Button><Button className="w-full" variant="outline" onClick={() => { setChannel("whatsapp"); setView("password"); }}><MessageCircle className="mr-2 size-4" /> Entrar com WhatsApp</Button><div className="border-t pt-3"><Button className="w-full" variant="secondary" onClick={() => setView("register")}><UserRound className="mr-2 size-4" /> Criar cadastro</Button></div></div>}
    {view === "password" && <div className="space-y-3"><div className="space-y-1.5"><Label>{channel === "email" ? "E-mail" : "WhatsApp"}</Label><Input type={channel === "email" ? "email" : "tel"} value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></div>{channel === "email" && <><div className="space-y-1.5"><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div><Button className="w-full" disabled={busy} onClick={passwordLogin}>Entrar com senha</Button><Button variant="link" className="w-full" onClick={async () => { if (!identifier.includes("@")) { toast.error("Informe seu e-mail."); return; } await supabase.auth.resetPasswordForEmail(identifier, { redirectTo: `${window.location.origin}/redefinir-senha` }); toast.success("Enviamos o link de recuperação."); }}>Esqueceu a senha?</Button></>}<Button className="w-full" variant="outline" disabled={busy} onClick={sendCode}>Receber código por {channel === "email" ? "e-mail" : "WhatsApp"}</Button><Button variant="ghost" className="w-full" onClick={() => setView("start")}>Voltar</Button></div>}
    {view === "code" && <div className="space-y-3"><Label>Código de 6 dígitos</Label><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(onlyDigits(e.target.value))} /><Button className="w-full" disabled={busy || code.length !== 6} onClick={verifyCode}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />} Confirmar código</Button><Button variant="outline" className="w-full" disabled={busy} onClick={sendCode}>Enviar novamente</Button><Button variant="ghost" className="w-full" onClick={() => setView("start")}>Usar outro acesso</Button></div>}
    {view === "register" && <div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Nome completo</Label><Input value={registration.name} onChange={(e) => setRegistration({ ...registration, name: e.target.value })} /></div><div><Label>E-mail</Label><Input type="email" value={registration.email} onChange={(e) => setRegistration({ ...registration, email: e.target.value })} /></div><div><Label>WhatsApp</Label><Input type="tel" value={registration.phone} onChange={(e) => setRegistration({ ...registration, phone: e.target.value })} /></div><div><Label>Senha</Label><Input type="password" value={registration.password} onChange={(e) => setRegistration({ ...registration, password: e.target.value })} /></div><div><Label>Confirmar senha</Label><Input type="password" value={registration.confirm} onChange={(e) => setRegistration({ ...registration, confirm: e.target.value })} /></div><label className="flex gap-2 text-sm sm:col-span-2"><Checkbox checked={registration.terms} onCheckedChange={(v) => setRegistration({ ...registration, terms: v === true })} /> Aceito os Termos de Uso e a Política de Privacidade.</label><label className="flex gap-2 text-sm sm:col-span-2"><Checkbox checked={registration.marketing} onCheckedChange={(v) => setRegistration({ ...registration, marketing: v === true })} /> Quero receber novidades e ofertas.</label><Button className="sm:col-span-2" disabled={busy} onClick={register}>Criar cadastro e continuar</Button><Button variant="ghost" className="sm:col-span-2" onClick={() => setView("start")}>Já tenho cadastro</Button></div>}
    {view === "addresses" && customer && <div className="space-y-3"><div className="rounded-lg border border-border bg-muted/40 p-3 text-sm"><strong>{customer.fullName}</strong><p className="text-muted-foreground">{customer.email} · {customer.phone}</p></div>{props.needsAddress && <div className="space-y-2">{customer.addresses.map((item) => <button key={item.id} type="button" onClick={() => setSelectedAddress(item.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${selectedAddress === item.id ? "border-primary bg-primary/5" : "border-border"}`}><span className="flex items-center gap-2 font-medium"><MapPin className="size-4" /> {item.label}{item.isDefault ? " · Padrão" : ""}</span><span className="mt-1 block text-muted-foreground">{item.street}, {item.number ?? "s/n"} · {item.city}</span></button>)}<Button variant="outline" className="w-full" onClick={() => setView("new-address")}><Plus className="mr-2 size-4" /> Cadastrar outro endereço</Button></div>}<Button className="w-full" onClick={finish}>Continuar para confirmação</Button><Button variant="ghost" className="w-full" onClick={async () => { await supabase.auth.signOut(); setCustomer(null); setView("start"); }}>Entrar com outra conta</Button></div>}
    {view === "new-address" && <div className="grid gap-3 sm:grid-cols-2">{field("label", "Nome do endereço", "Casa")}{field("zip", "CEP")}{field("street", "Rua")}{field("number", "Número")}{field("district", "Bairro")}{field("city", "Cidade")}{field("state", "Estado")}{field("complement", "Complemento")}{<div className="sm:col-span-2">{field("reference", "Ponto de referência")}</div>}<label className="flex gap-2 text-sm sm:col-span-2"><Checkbox checked={makeDefault} onCheckedChange={(v) => setMakeDefault(v === true)} /> Usar como endereço padrão</label><Button className="sm:col-span-2" disabled={busy} onClick={createAddress}>Salvar endereço</Button>{customer?.addresses.length ? <Button variant="ghost" className="sm:col-span-2" onClick={() => setView("addresses")}>Voltar aos endereços</Button> : null}</div>}
  </DialogContent></Dialog>;
}