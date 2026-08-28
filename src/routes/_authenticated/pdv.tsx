import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ExclusiveShell, ExitConfirmDialog } from "@/components/pos/ExclusiveShell";
import { ManagerAuthDialog } from "@/components/pos/ManagerAuthDialog";
import { PosCartPanel } from "@/components/pos/PosCartPanel";
import {
  CashMovementDialog,
  CashMovementsListDialog,
  CloseCashDialog,
  OpenCashDialog,
  type CashMovementRow,
} from "@/components/pos/PosCashDialogs";
import {
  CustomerPickerDialog,
  OrderLookupDialog,
  SaleDiscountDialog,
  SaleNotesDialog,
  SuspendedSalesDialog,
  TableMapDialog,
  type PosCustomer,
  type PosRecentSale,
  type PosTable,
} from "@/components/pos/PosDialogs";
import { PosLineEditorDialog, type ProductOptionGroup } from "@/components/pos/PosLineEditorDialog";
import { PosPaymentDialog, type PixChargeState } from "@/components/pos/PosPaymentDialog";
import { PosCategoryRail, PosProductGrid } from "@/components/pos/PosProductGrid";
import { PosSettingsDialog } from "@/components/pos/PosSettingsDialog";
import { EmptyState } from "@/components/painel/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useFeatureGuard } from "@/hooks/useFeatureGuard";
import { useExclusiveShell, useOnlineStatus, useTicker } from "@/hooks/useExclusiveShell";
import { setAppTheme, useAppTheme } from "@/hooks/useAppTheme";
import { useActiveStore } from "@/hooks/useMyStores";
import { usePosKdsSettings } from "@/hooks/usePosKdsSettings";
import { usePosSale } from "@/hooks/usePosSale";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { expectedCashBalance, findByCode, validateSplitPayments } from "@/lib/pdv";
import { findScaleProduct, parseScaleBarcode, scaleQuantity } from "@/lib/peso";
import { batchAlertsByProduct, batchStatus, batchesKey, daysUntilExpiry, fetchBatches } from "@/lib/lotes";
import { PosWeightDialog, type WeightSaleProduct } from "@/components/pos/PosWeightDialog";
import {
  cancelPosSale,
  closeCashSession,
  openCashSession,
  posPixCharge,
  registerCashMovement,
  registerPosSale,
  type PosSaleResult,
} from "@/lib/pdv.functions";
import { filterPosCatalog, unitPriceOf, type PosProductLike, type PosQuickFilter } from "@/lib/pos-kds";
import { setProductAvailability } from "@/lib/operacao.functions";
import { StorePauseButton } from "@/components/painel/StorePauseButton";
import { lineTotal, lineUnitPrice, newPaymentEntry, type PosPaymentEntry } from "@/lib/pos-sale";
import { hasPermission, normalizePermissions, type PermissionArea } from "@/lib/permissions";
import { defaultPrintSettings, printOrder } from "@/lib/print";
import {
  Banknote,
  ClipboardList,
  Copy,
  Grid2x2,
  ListChecks,
  PauseCircle,
  Percent,
  Receipt,
  ScanLine,
  Settings,
  StickyNote,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/pdv")({
  component: PosScreen,
  head: () => ({
    meta: [
      { title: "PDV em tela exclusiva | O Seu Pedido" },
      {
        name: "description",
        content:
          "Ponto de venda em tela cheia: catálogo com busca por código de barras, comanda, pagamentos divididos, caixa e mesas.",
      },
    ],
  }),
});

function PosScreen() {
  useFeatureGuard("pdv");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { active } = useActiveStore();
  const { user } = useSession();
  const storeId = active?.storeId;
  const online = useOnlineStatus();
  const nowTick = useTicker(30_000);

  const permissions = normalizePermissions((active as unknown as { permissions?: unknown } | null)?.permissions);
  const can = useCallback(
    (area: PermissionArea) => hasPermission(active?.role, permissions, area),
    [active?.role, permissions],
  );

  const { settings, hasTerminalOverride, save, resetTerminal, isSaving } = usePosKdsSettings(storeId, "pdv");
  const terminal = settings.terminal || "Caixa 1";
  const sale = usePosSale(storeId, terminal);
  const { draft, totals } = sale;

  const availabilityFn = useServerFn(setProductAvailability);
  const pauseProduct = useMutation({
    mutationFn: ({ product, available }: { product: PosProductLike; available: boolean }) =>
      availabilityFn({ data: { productId: product.id, available } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["pos-catalog", storeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /* ---------- Telas e diálogos ---------- */
  const [exitOpen, setExitOpen] = useState(false);
  const { theme } = useAppTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [suspendedOpen, setSuspendedOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [openCashOpen, setOpenCashOpen] = useState(false);
  const [closeCashOpen, setCloseCashOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [managerAction, setManagerAction] = useState<string | null>(null);
  const approvalRef = useRef<(() => void) | null>(null);

  const shell = useExclusiveShell({ onRequestExit: () => setExitOpen(true) });

  /* ---------- Catálogo ---------- */
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [quick, setQuick] = useState<PosQuickFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const catalogQuery = useQuery({
    queryKey: ["pos-catalog", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const [products, categories, groups, options] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id, name, sku, barcode, price, promo_price, track_stock, stock_quantity, min_stock, category_id, is_featured, is_available, kind, created_at, image_url, sold_by_weight, unit_label, requires_prescription, track_batches",
          )
          .eq("store_id", storeId!)
          .eq("is_active", true)
          .is("archived_at", null)
          .order("name"),
        supabase.from("categories").select("id, name").eq("store_id", storeId!).order("sort_order"),
        supabase
          .from("product_option_groups")
          .select("id, product_id, name, is_required, max_select")
          .eq("store_id", storeId!)
          .order("sort_order"),
        supabase
          .from("product_options")
          .select("id, group_id, name, price_delta, is_available")
          .eq("store_id", storeId!)
          .order("sort_order"),
      ]);
      if (products.error) throw new Error(products.error.message);
      return {
        products: (products.data ?? []) as unknown as PosProductLike[],
        categories: categories.data ?? [],
        groups: groups.data ?? [],
        options: options.data ?? [],
      };
    },
  });

  const batchesQuery = useQuery({
    queryKey: batchesKey(storeId),
    enabled: Boolean(storeId),
    queryFn: () => fetchBatches(storeId!),
  });

  /** Lotes vencidos ou perto de vencer, para avisar o operador na hora da venda. */
  const batchAlerts = useMemo(() => batchAlertsByProduct(batchesQuery.data ?? []), [batchesQuery.data]);

  const storeQuery = useQuery({
    queryKey: ["pos-store", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const [store, print] = await Promise.all([
        supabase
          .from("stores")
          .select("name, logo_url, phone, address_street, address_number, address_district, address_city")
          .eq("id", storeId!)
          .maybeSingle(),
        supabase.from("print_settings").select("*").eq("store_id", storeId!).maybeSingle(),
      ]);
      return { store: store.data, print: print.data };
    },
  });

  const customersQuery = useQuery({
    queryKey: ["pos-customers", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, loyalty_accounts(points_balance, cashback_balance)")
        .eq("store_id", storeId!)
        .order("name")
        .limit(400);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => {
        const loyalty = (Array.isArray(row.loyalty_accounts) ? row.loyalty_accounts[0] : row.loyalty_accounts) as
          | { points_balance?: number; cashback_balance?: number }
          | null
          | undefined;
        return {
          id: row.id,
          name: row.name,
          phone: row.phone,
          points: Number(loyalty?.points_balance ?? 0),
          cashback: Number(loyalty?.cashback_balance ?? 0),
        };
      }) satisfies PosCustomer[];
    },
  });

  const sessionQuery = useQuery({
    queryKey: ["pos-cash-session", storeId, terminal],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("id, terminal, status, opening_balance, opened_at")
        .eq("store_id", storeId!)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(5);
      if (error) throw new Error(error.message);
      const list = data ?? [];
      return list.find((row) => row.terminal === terminal) ?? list[0] ?? null;
    },
  });
  const cashSession = sessionQuery.data ?? null;

  const movementsQuery = useQuery({
    queryKey: ["pos-cash-movements", cashSession?.id],
    enabled: Boolean(cashSession?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("id, kind, method, amount, reason, created_at")
        .eq("session_id", cashSession!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CashMovementRow[];
    },
  });

  const tablesQuery = useQuery({
    queryKey: ["pos-tables", storeId],
    enabled: Boolean(storeId) && tablesOpen,
    queryFn: async () => {
      const [tables, sessions] = await Promise.all([
        supabase
          .from("dining_tables")
          .select("id, label, seats, status, is_active")
          .eq("store_id", storeId!)
          .eq("is_active", true)
          .order("label"),
        supabase
          .from("table_sessions")
          .select("id, code, label, guests, table_id, status")
          .eq("store_id", storeId!)
          .in("status", ["open", "awaiting_payment"]),
      ]);
      const sessionByTable = new Map((sessions.data ?? []).map((item) => [item.table_id, item]));
      return (tables.data ?? []).map((table) => {
        const found = sessionByTable.get(table.id);
        return {
          id: table.id,
          label: table.label,
          status: table.status,
          seats: table.seats,
          session: found
            ? { id: found.id, code: found.code, guests: found.guests, label: found.label, total: 0 }
            : null,
        } satisfies PosTable;
      });
    },
  });

  const salesQuery = useQuery({
    queryKey: ["pos-recent-sales", storeId, nowTick],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, code, customer_name, total, status, created_at")
        .eq("store_id", storeId!)
        .eq("type", "counter")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PosRecentSale[];
    },
  });

  /* ---------- Catálogo filtrado ---------- */
  const products = catalogQuery.data?.products ?? [];
  const bestSellerIds = useMemo(() => products.filter((item) => item.is_featured).map((item) => item.id), [products]);

  const visibleProducts = useMemo(
    () =>
      filterPosCatalog(products, {
        search,
        categoryId,
        quick,
        hideOutOfStock: settings.hideOutOfStock,
        bestSellerIds,
        favoriteIds: bestSellerIds,
      }),
    [products, search, categoryId, quick, settings.hideOutOfStock, bestSellerIds],
  );

  const quantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const line of draft.lines) map[line.productId] = (map[line.productId] ?? 0) + line.quantity;
    return map;
  }, [draft.lines]);

  const editingLine = draft.lines.find((line) => line.lineId === editingLineId) ?? null;
  const optionGroups = useMemo<ProductOptionGroup[]>(() => {
    if (!editingLine) return [];
    const groups = (catalogQuery.data?.groups ?? []).filter((group) => group.product_id === editingLine.productId);
    const options = catalogQuery.data?.options ?? [];
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      is_required: group.is_required,
      max_select: group.max_select,
      options: options
        .filter((option) => option.group_id === group.id && option.is_available !== false)
        .map((option) => ({ id: option.id, name: option.name, price: Number(option.price_delta ?? 0) })),
    }));
  }, [editingLine, catalogQuery.data]);

  /* ---------- Pagamento ---------- */
  const [entries, setEntries] = useState<PosPaymentEntry[]>([]);
  const [cashReceived, setCashReceived] = useState(0);
  const [sendToKds, setSendToKds] = useState(false);
  const [pix, setPix] = useState<PixChargeState | null>(null);
  const [saleResult, setSaleResult] = useState<PosSaleResult | null>(null);
  const lastSaleRef = useRef<{ code: string; total: number; method: string; phone: string; name: string } | null>(null);

  const change = useMemo(() => Math.max(cashReceived - totals.total, 0), [cashReceived, totals.total]);

  /* ---------- Mutations ---------- */
  const requireApproval = useCallback((action: string, onApproved: () => void) => {
    approvalRef.current = onApproved;
    setManagerAction(action);
  }, []);

  const managerMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const { authorizeManagerAction } = await import("@/lib/pdv.functions");
      return authorizeManagerAction({
        data: { storeId: storeId!, action: managerAction ?? "acao", ...credentials },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setManagerAction(null);
      approvalRef.current?.();
      approvalRef.current = null;
    },
    onError: () => toast.error("Não foi possível validar a autorização."),
  });

  const openCashMutation = useMutation({
    mutationFn: (input: { openingBalance: number; terminal: string; notes: string }) =>
      openCashSession({ data: { storeId: storeId!, ...input } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      if (result.ok) setOpenCashOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["pos-cash-session", storeId] });
    },
    onError: () => toast.error("Não foi possível abrir o caixa."),
  });

  const closeCashMutation = useMutation({
    mutationFn: (input: { countedBalance: number; justification: string }) =>
      closeCashSession({ data: { sessionId: cashSession!.id, ...input } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      if (result.ok) setCloseCashOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["pos-cash-session", storeId] });
    },
    onError: () => toast.error("Não foi possível fechar o caixa."),
  });

  const movementMutation = useMutation({
    mutationFn: (input: { kind: "cash_in" | "cash_out" | "withdrawal" | "supply"; amount: number; reason: string }) =>
      registerCashMovement({ data: { sessionId: cashSession!.id, method: "cash", ...input } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      if (result.ok) setMovementOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["pos-cash-movements", cashSession?.id] });
    },
    onError: () => toast.error("Não foi possível registrar a movimentação."),
  });

  const pixMutation = useMutation({
    mutationFn: (amount: number) => posPixCharge({ data: { storeId: storeId!, amount } }),
    onSuccess: (result) => {
      setPix({
        message: result.message,
        ...(result.payload ? { payload: result.payload } : {}),
        ...(result.demo === undefined ? {} : { demo: result.demo }),
      });
    },
    onError: () => toast.error("Não foi possível gerar a cobrança Pix."),
  });

  const saleMutation = useMutation({
    mutationFn: async () => {
      const payments = entries.length > 0 ? entries : [newPaymentEntry("cash", totals.total)];
      return registerPosSale({
        data: {
          storeId: storeId!,
          sessionId: cashSession!.id,
          fulfillment: draft.fulfillment,
          terminal,
          customerId: draft.customerId,
          customerName: draft.customerName || "Consumidor",
          customerPhone: draft.customerPhone,
          tableNumber: draft.tableNumber,
          tableSessionId: draft.tableSessionId,
          notes: draft.notes,
          discount: draft.discount,
          discountReason: draft.discountReason,
          couponCode: draft.couponCode,
          cashbackUsed: draft.cashbackUsed,
          fee: draft.fee,
          sendToKds,
          items: draft.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            weightKg: line.soldByWeight ? line.quantity : undefined,
            prescriptionInfo: line.prescriptionInfo || undefined,
            notes: line.notes,
            discount: line.discount,
            options: line.options.map((option) => ({ name: option.name, price: option.price })),
          })),
          payments: payments.map((entry) => ({ method: entry.method, amount: entry.amount })),
        },
      });
    },
    onSuccess: async (result) => {
      setSaleResult(result);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      lastSaleRef.current = {
        code: result.code ?? "",
        total: result.total ?? totals.total,
        method: entries[0]?.method ?? "cash",
        phone: draft.customerPhone,
        name: draft.customerName || "Consumidor",
      };
      toast.success(result.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pos-cash-movements", cashSession?.id] }),
        queryClient.invalidateQueries({ queryKey: ["pos-catalog", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["pos-recent-sales", storeId] }),
      ]);
    },
    onError: () => toast.error("Não foi possível concluir a venda."),
  });

  const cancelMutation = useMutation({
    mutationFn: (input: { orderId: string; reason: string }) =>
      cancelPosSale({ data: { orderId: input.orderId, sessionId: cashSession!.id, reason: input.reason } }),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      await queryClient.invalidateQueries({ queryKey: ["pos-recent-sales", storeId] });
    },
    onError: () => toast.error("Não foi possível cancelar a venda."),
  });

  /* ---------- Ações ---------- */
  const requireCash = useCallback((): boolean => {
    if (cashSession) return true;
    toast.error("Abra o caixa antes de vender.");
    setOpenCashOpen(true);
    return false;
  }, [cashSession]);

  const [weightProduct, setWeightProduct] = useState<WeightSaleProduct | null>(null);
  const [scaleWeight, setScaleWeight] = useState(0);

  const handleAdd = useCallback(
    (product: PosProductLike, quantity: number) => {
      const special = product as WeightSaleProduct;
      // Peso e itens controlados passam pelo diálogo antes de entrar na venda.
      if (quantity > 0 && (special.sold_by_weight || special.requires_prescription)) {
        setScaleWeight(0);
        setWeightProduct(special);
        return;
      }
      sale.addProduct(product, { quantity });
    },
    [sale],
  );

  const handleScan = (event: FormEvent) => {
    event.preventDefault();
    const term = search.trim();
    if (!term) return;
    // Etiqueta da balança: o código traz o item e o peso já pesado.
    const label = parseScaleBarcode(term);
    if (label) {
      const scaled = findScaleProduct(products, label);
      if (scaled) {
        const weight = scaleQuantity(label, unitPriceOf(scaled));
        const special = scaled as WeightSaleProduct;
        if (weight > 0 && !special.requires_prescription) {
          sale.addProduct(scaled, {
            weight,
            unitLabel: special.unit_label && special.unit_label !== "un" ? special.unit_label : "kg",
          });
        } else {
          setScaleWeight(weight);
          setWeightProduct(special);
        }
        setSearch("");
        return;
      }
    }
    const found = findByCode(products as unknown as { barcode?: string | null; sku?: string | null }[], term);
    if (found) {
      handleAdd(found as unknown as PosProductLike, 1);
      setSearch("");
      return;
    }
    if (visibleProducts.length === 1) {
      handleAdd(visibleProducts[0]!, 1);
      setSearch("");
    }
  };

  const openCheckout = () => {
    if (draft.lines.length === 0) {
      toast.error("Adicione itens à venda.");
      return;
    }
    if (!requireCash()) return;
    setSaleResult(null);
    setPix(null);
    setEntries([newPaymentEntry("cash", totals.total)]);
    setCashReceived(0);
    setPaymentOpen(true);
  };

  const confirmSale = () => {
    const payments = entries.length > 0 ? entries : [newPaymentEntry("cash", totals.total)];
    const check = validateSplitPayments(
      payments.map((entry) => ({ id: entry.id, method: entry.method, amount: entry.amount })),
      totals.total,
    );
    if (!check.ok) {
      toast.error(check.message);
      return;
    }
    saleMutation.mutate();
  };

  const printReceipt = useCallback(() => {
    const store = storeQuery.data?.store;
    const print = storeQuery.data?.print;
    printOrder(
      {
        code: lastSaleRef.current?.code ?? draft.id.slice(-6).toUpperCase(),
        type: draft.fulfillment,
        status: "completed",
        created_at: new Date().toISOString(),
        customer_name: draft.customerName || "Consumidor",
        customer_phone: draft.customerPhone || null,
        address: null,
        notes: draft.notes || null,
        subtotal: totals.subtotal,
        delivery_fee: totals.fee,
        discount: totals.discount,
        total: lastSaleRef.current?.total ?? totals.total,
        payment_method: lastSaleRef.current?.method ?? null,
        payment_status: "paid",
        table_number: draft.tableNumber || null,
        items: draft.lines.map((line) => ({
          product_name: line.name,
          quantity: line.quantity,
          unit_price: lineUnitPrice(line),
          total: lineTotal(line),
          notes: line.notes || null,
        })),
      },
      {
        name: store?.name ?? "Loja",
        phone: store?.phone ?? null,
        address_street: store?.address_street ?? null,
        address_number: store?.address_number ?? null,
        address_district: store?.address_district ?? null,
        address_city: store?.address_city ?? null,
      },
      print ? { ...defaultPrintSettings(), ...print, mode: print.mode === "common" ? "common" : "thermal" } : defaultPrintSettings(),
    );
  }, [draft, totals, storeQuery.data]);

  const sendWhatsApp = () => {
    const phone = (lastSaleRef.current?.phone ?? "").replace(/\D/g, "");
    const text = `Recibo da venda ${lastSaleRef.current?.code ?? ""} — total ${formatCurrency(
      lastSaleRef.current?.total ?? totals.total,
    )}`;
    const url = phone
      ? `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener");
  };

  const finishSale = () => {
    setPaymentOpen(false);
    setSaleResult(null);
    setPix(null);
    setEntries([]);
    setCashReceived(0);
    sale.newSale();
  };

  // Atalhos de teclado do balcão: F2 busca, F4 pagamento, F9 suspender.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "F4") {
        event.preventDefault();
        openCheckout();
      }
      if (event.key === "F9") {
        event.preventDefault();
        if (sale.suspend()) toast.success("Venda suspensa.");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const expected = expectedCashBalance(
    Number(cashSession?.opening_balance ?? 0),
    (movementsQuery.data ?? []).map((row) => ({ kind: row.kind, method: row.method, amount: Number(row.amount) })),
  );
  const clock = new Date(nowTick || Date.now()).toLocaleTimeString("pt-BR", { timeStyle: "short" });

  const quickActions = [
    { label: "Suspender (F9)", icon: PauseCircle, onClick: () => (sale.suspend() ? toast.success("Venda suspensa.") : toast.error("Nada para suspender.")) },
    { label: "Vendas suspensas", icon: ListChecks, onClick: () => setSuspendedOpen(true) },
    { label: "Duplicar venda", icon: Copy, onClick: () => sale.duplicate() },
    { label: "Desconto e taxa", icon: Percent, onClick: () => setDiscountOpen(true) },
    { label: "Observação", icon: StickyNote, onClick: () => setNotesOpen(true) },
    { label: "Mesas e comandas", icon: Grid2x2, onClick: () => setTablesOpen(true) },
    { label: "Vendas do dia", icon: Receipt, onClick: () => setLookupOpen(true) },
    {
      label: cashSession ? "Sangria e suprimento" : "Abrir caixa",
      icon: Banknote,
      onClick: () => (cashSession ? setMovementOpen(true) : setOpenCashOpen(true)),
    },
    { label: "Movimentações", icon: ClipboardList, onClick: () => setMovementsOpen(true) },
    {
      label: "Fechar caixa",
      icon: Wallet,
      onClick: () => (cashSession ? setCloseCashOpen(true) : toast.error("Nenhum caixa aberto.")),
    },
    { label: "Configurações", icon: Settings, onClick: () => setSettingsOpen(true) },
  ];

  return (
    <ExclusiveShell
      storeName={storeQuery.data?.store?.name ?? active?.store?.name ?? "Loja"}
      storeLogoUrl={storeQuery.data?.store?.logo_url}
      moduleLabel="PDV"
      operatorName={user?.email ?? "Operador"}
      terminal={terminal}
      online={online}
      clock={clock}
      cashStatus={{
        open: Boolean(cashSession),
        label: cashSession ? `Caixa aberto · ${formatCurrency(expected)}` : "Caixa fechado",
      }}
      isFullscreen={shell.isFullscreen}
      fullscreenSupported={shell.fullscreenSupported}
      onToggleFullscreen={shell.toggleFullscreen}
      onExit={() => setExitOpen(true)}
      theme={theme}
      onToggleTheme={() => {
        const next = theme === "dark" ? "light" : "dark";
        setAppTheme(next);
        save({ theme: next }, "terminal");
      }}
      toolbar={
        <div className="flex min-w-52 flex-1 items-center gap-2">
          <StorePauseButton storeId={storeId} />
          <form onSubmit={handleScan} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar produto ou ler código de barras (F2)"
              aria-label="Buscar produto ou ler código de barras"
              className="h-11 pl-9"
            />
          </div>
          </form>
        </div>
      }
    >
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden lg:flex-row">
        <section aria-label="Catálogo" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3">
          <PosCategoryRail
            categories={catalogQuery.data?.categories ?? []}
            categoryId={categoryId}
            onCategory={setCategoryId}
            quick={quick}
            onQuick={setQuick}
          />
          {batchAlerts.size > 0 ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <strong>Validade:</strong>{" "}
              {[...batchAlerts.entries()]
                .slice(0, 3)
                .map(([productId, list]) => {
                  const batch = list[0]!;
                  const name = products.find((item) => item.id === productId)?.name ?? "Item";
                  const days = daysUntilExpiry(batch.expires_at) ?? 0;
                  const status = batchStatus(batch);
                  return `${name} — lote ${batch.batch_code || "sem código"} ${
                    status === "vencido" ? `vencido há ${Math.abs(days)} dia(s)` : `vence em ${days} dia(s)`
                  }`;
                })
                .join(" · ")}
              {batchAlerts.size > 3 ? ` e mais ${batchAlerts.size - 3} item(ns).` : "."}
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            <PosProductGrid
              products={visibleProducts}
              isLoading={catalogQuery.isLoading}
              settings={settings}
              bestSellerIds={bestSellerIds}
              quantities={quantities}
              onAdd={handleAdd}
              onOpenDetails={(product) => handleAdd(product, 1)}
              onTogglePause={can("catalog") ? (product, available) => pauseProduct.mutate({ product, available }) : undefined}
              emptyState={
                <EmptyState
                  title="Nenhum produto encontrado"
                  description="Ajuste a busca, o filtro rápido ou a categoria selecionada."
                />
              }
            />
          </div>
        </section>

        <aside className="flex min-h-0 w-full shrink-0 border-t border-border lg:w-[26rem] lg:border-t-0 lg:border-l">
          <div className="min-h-0 flex-1">
            <PosCartPanel
              draft={draft}
              totals={totals}
              showImages={settings.showProductImages}
              received={cashReceived}
              change={change}
              onFulfillment={sale.setFulfillment}
              onQuantity={sale.changeQuantity}
              onRemove={sale.removeLine}
              onEditLine={setEditingLineId}
              onPickCustomer={() => setCustomerOpen(true)}
              onPickTable={() => setTablesOpen(true)}
              onClear={sale.clear}
              onCheckout={openCheckout}
              disabled={saleMutation.isPending}
            />
          </div>
        </aside>

        <nav aria-label="Ações rápidas" className="hidden w-56 shrink-0 border-l border-border bg-muted/30 xl:block">
          <div className="h-full w-56 overflow-y-auto">
            <div className="space-y-1.5 p-3">
              <Badge variant="outline" className="mb-1 w-full justify-center py-1 font-semibold">
                {totals.itemCount} item(ns) · {formatCurrency(totals.total)}
              </Badge>
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  className="h-12 w-full justify-start gap-2 text-sm font-semibold"
                  onClick={action.onClick}
                >
                  <action.icon className="size-4" aria-hidden="true" />
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        </nav>
      </div>

      {/* Ações rápidas em telas menores */}
      <div className="xl:hidden">
        <ScrollArea className="w-full border-t border-border bg-muted/30">
          <div className="flex gap-2 p-2">
            {quickActions.map((action) => (
              <Button key={action.label} variant="outline" className="h-11 shrink-0 gap-2" onClick={action.onClick}>
                <action.icon className="size-4" aria-hidden="true" />
                {action.label}
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <ExitConfirmDialog
        open={exitOpen}
        onOpenChange={setExitOpen}
        title="Sair do PDV?"
        description="A venda em andamento fica salva neste terminal e você volta para o painel."
        onConfirm={() => navigate({ to: "/painel" })}
      />

      <PosSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        showKdsOptions={false}
        hasTerminalOverride={hasTerminalOverride}
        isSaving={isSaving}
        onSave={(patch, scope) => {
          if (patch.theme) setAppTheme(patch.theme);
          save(patch, scope);
        }}
        onResetTerminal={resetTerminal}
      />

      <SuspendedSalesDialog
        open={suspendedOpen}
        onOpenChange={setSuspendedOpen}
        suspended={sale.suspended}
        onResume={(id) => {
          sale.resume(id);
          setSuspendedOpen(false);
        }}
        onDiscard={sale.discard}
      />

      <CustomerPickerDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        customers={customersQuery.data ?? []}
        selectedId={draft.customerId}
        onSelect={(customer) => {
          sale.patch({ customerId: customer.id, customerName: customer.name, customerPhone: customer.phone ?? "" });
          setCustomerOpen(false);
        }}
        onClear={() => sale.patch({ customerId: null, customerName: "", customerPhone: "" })}
      />

      <TableMapDialog
        open={tablesOpen}
        onOpenChange={setTablesOpen}
        tables={tablesQuery.data ?? []}
        selectedSessionId={draft.tableSessionId}
        onSelect={(table) => {
          sale.patch({
            fulfillment: "dine_in",
            tableNumber: table.label,
            tableSessionId: table.session?.id ?? null,
          });
          setTablesOpen(false);
        }}
        onPrintPreBill={() => printReceipt()}
        onCallWaiter={() => toast.info("Chamado enviado ao salão.")}
        onTransfer={() => toast.info("Use o módulo de salão para transferir comandas.")}
        onMerge={() => toast.info("Use o módulo de salão para juntar comandas.")}
      />

      <SaleDiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        subtotal={totals.subtotal}
        discount={draft.discount}
        reason={draft.discountReason}
        couponCode={draft.couponCode}
        cashbackAvailable={customersQuery.data?.find((item) => item.id === draft.customerId)?.cashback ?? 0}
        cashbackUsed={draft.cashbackUsed}
        fee={draft.fee}
        canDiscount={can("pos_discount")}
        onSave={(input) => {
          sale.patch(input);
          setDiscountOpen(false);
        }}
        onRequestApproval={() => requireApproval("desconto na venda", () => setDiscountOpen(true))}
      />

      <SaleNotesDialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        notes={draft.notes}
        label={draft.label}
        onSave={(input) => {
          sale.patch(input);
          setNotesOpen(false);
        }}
      />

      <OrderLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        sales={salesQuery.data ?? []}
        canCancel={can("pos_cancel")}
        onReprint={() => printReceipt()}
        onCancel={(saleRow) => {
          if (!cashSession) {
            toast.error("Abra o caixa para cancelar vendas.");
            return;
          }
          cancelMutation.mutate({ orderId: saleRow.id, reason: "Cancelamento no PDV" });
        }}
      />

      <OpenCashDialog
        open={openCashOpen}
        onOpenChange={setOpenCashOpen}
        terminal={terminal}
        operatorName={user?.email ?? "Operador"}
        isPending={openCashMutation.isPending}
        onConfirm={(input) => openCashMutation.mutate(input)}
      />

      <CloseCashDialog
        open={closeCashOpen}
        onOpenChange={setCloseCashOpen}
        expected={expected}
        openingBalance={Number(cashSession?.opening_balance ?? 0)}
        isPending={closeCashMutation.isPending}
        onConfirm={(input) => closeCashMutation.mutate(input)}
        onExport={() => setMovementsOpen(true)}
      />

      <CashMovementDialog
        open={movementOpen}
        onOpenChange={setMovementOpen}
        canWithdraw={can("pos_withdrawal")}
        isPending={movementMutation.isPending}
        onConfirm={(input) => movementMutation.mutate(input)}
        onRequestApproval={() => requireApproval("sangria de caixa", () => setMovementOpen(true))}
      />

      <CashMovementsListDialog
        open={movementsOpen}
        onOpenChange={setMovementsOpen}
        movements={movementsQuery.data ?? []}
        expected={expected}
        openingBalance={Number(cashSession?.opening_balance ?? 0)}
        terminal={terminal}
        openedAt={cashSession?.opened_at ?? ""}
      />

      <PosWeightDialog
        product={weightProduct}
        suggestedWeight={scaleWeight}
        onClose={() => setWeightProduct(null)}
        onConfirm={({ weight, unitLabel, prescriptionInfo }) => {
          if (weightProduct) {
            sale.addProduct(weightProduct, {
              ...(weight > 0 ? { weight, unitLabel } : { quantity: 1 }),
              prescriptionInfo,
            });
          }
          setWeightProduct(null);
        }}
      />

      <PosLineEditorDialog
        open={Boolean(editingLine)}
        onOpenChange={(value) => (value ? null : setEditingLineId(null))}
        line={editingLine}
        optionGroups={optionGroups}
        canDiscount={can("pos_discount")}
        onSave={(patch) => {
          if (editingLineId) sale.updateLine(editingLineId, patch);
          setEditingLineId(null);
        }}
        onRequestDiscountApproval={() => requireApproval("desconto no item", () => undefined)}
      />

      <PosPaymentDialog
        open={paymentOpen}
        onOpenChange={(value) => (value ? setPaymentOpen(true) : finishSale())}
        total={totals.total}
        entries={entries}
        onEntriesChange={setEntries}
        cashReceived={cashReceived}
        onCashReceivedChange={setCashReceived}
        sendToKds={sendToKds}
        onSendToKdsChange={setSendToKds}
        isPending={saleMutation.isPending}
        onConfirm={confirmSale}
        result={saleResult}
        pix={pix}
        onRequestPix={(amount) => pixMutation.mutate(amount)}
        pixPending={pixMutation.isPending}
        onPrintReceipt={printReceipt}
        onSendWhatsApp={sendWhatsApp}
        onNewSale={finishSale}
        onExit={() => {
          finishSale();
          setExitOpen(true);
        }}
      />

      <ManagerAuthDialog
        open={Boolean(managerAction)}
        onOpenChange={(value) => (value ? null : setManagerAction(null))}
        action={managerAction ?? ""}
        isPending={managerMutation.isPending}
        onConfirm={(credentials) => managerMutation.mutate(credentials)}
      />
    </ExclusiveShell>
  );
}
