import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import { ArrowDownLeft, ArrowUpRight, Check, Gift, Lock, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

export const PRIVILEGES = [
  { key: "comment", threshold: 50 },
  { key: "editCommunityPosts", threshold: 100 },
  { key: "voteToClose", threshold: 250 },
  { key: "report", threshold: 500 },
] as const;

export const TRANSFER_RULES = { minBalance: 50, maxPerTransaction: 50, maxPerDay: 100 };

export function PrivilegesCard({ reputation }: { reputation: number }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("rep.privileges")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {PRIVILEGES.map((p) => {
            const unlocked = reputation >= p.threshold;
            return (
              <li key={p.key} className="flex items-center justify-between gap-2 text-sm">
                <span className={`flex items-center gap-2 ${unlocked ? "text-gray-900" : "text-gray-500"}`}>
                  {unlocked ? <Check className="h-4 w-4 shrink-0 text-green-600" /> : <Lock className="h-4 w-4 shrink-0" />}
                  {t(`privilege.${p.key}`)}
                </span>
                <span className="shrink-0 text-xs text-gray-500">{p.threshold}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ReputationHistory({ userId, refreshKey = 0 }: { userId: string; refreshKey?: number }) {
  const { t, formatDateTime, language } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (target: number) => {
      setLoading(true);
      try {
        const res = await axiosInstance.get(`/user/${userId}/reputation`, { params: { page: target, limit: 15 } });
        setItems((prev) => (target === 1 ? res.data.data : [...prev, ...res.data.data]));
        setPage(target);
        setTotalPages(res.data.totalPages || 1);
      } catch {
        toast.error(t("common.error"));
      } finally {
        setLoading(false);
      }
    },
    [userId, t]
  );

  useEffect(() => {
    if (userId) load(1);
  }, [userId, refreshKey]);

  return (
    <Card id="reputation">
      <CardHeader>
        <CardTitle className="text-base">{t("rep.historyTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {!loading && items.length === 0 ? (
          <p className="text-sm text-gray-500">{t("rep.noHistory")}</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item._id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="flex min-w-0 items-start gap-2">
                  {item.delta > 0 ? (
                    <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{t(`repType.${item.type}` as any)}</p>
                    <p className="break-words text-xs text-gray-500">
                      {/* Server-written reasons are English; other languages show the translated type plus any member note. */}
                      {language === "en" ? item.reason : item.note ? `“${item.note}”` : null}
                      {item.questionId && (
                        <>
                          {" · "}
                          <Link href={`/questions/${item.questionId}`} className="text-blue-600 hover:underline">
                            {t("rep.viewQuestion")}
                          </Link>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">{formatDateTime(item.createdAt)}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`font-bold ${item.delta > 0 ? "text-green-700" : "text-red-700"}`}>
                    {item.delta > 0 ? `+${item.delta}` : item.delta}
                  </span>
                  {item.balanceAfter !== undefined && <p className="text-xs text-gray-400">= {item.balanceAfter}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {page < totalPages && (
          <div className="mt-3 text-center">
            <Button variant="outline" size="sm" disabled={loading} onClick={() => load(page + 1)}>
              {t("common.loadMore")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TransferHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t, formatDateTime } = useI18n();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    axiosInstance
      .get("/user/reputation/transfers", { params: { limit: 50 } })
      .then((res) => setData(res.data))
      .catch(() => setData({ data: [] }));
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("rep.transferHistory")}</CardTitle>
        {data?.remainingToday !== undefined && (
          <p className="text-xs text-gray-500">{t("rep.remainingToday", { amount: data.remainingToday, max: TRANSFER_RULES.maxPerDay })}</p>
        )}
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className="text-sm text-gray-500">{t("common.loading")}</p>
        ) : data.data.length === 0 ? (
          <p className="text-sm text-gray-500">{t("rep.noTransfers")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-2">{t("rep.colDate")}</th>
                  <th className="py-2 pr-2">{t("rep.colFrom")}</th>
                  <th className="py-2 pr-2">{t("rep.colTo")}</th>
                  <th className="py-2 pr-2">{t("rep.colReason")}</th>
                  <th className="py-2 text-right">{t("rep.colAmount")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((tr: any) => (
                  <tr key={tr._id}>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">{formatDateTime(tr.createdAt)}</td>
                    <td className="py-2 pr-2">
                      <Link href={`/users/${tr.sender?._id}`} className="text-blue-600 hover:underline">
                        {tr.sender?.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-2">
                      <Link href={`/users/${tr.receiver?._id}`} className="text-blue-600 hover:underline">
                        {tr.receiver?.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-2 break-words">{tr.reason}</td>
                    <td className={`py-2 text-right font-bold ${tr.direction === "sent" ? "text-red-700" : "text-green-700"}`}>
                      <span className="inline-flex items-center gap-1">
                        {tr.direction === "sent" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                        {tr.direction === "sent" ? `-${tr.amount}` : `+${tr.amount}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TransferButton({ receiver, onTransferred }: { receiver: { _id: string; name: string }; onTransferred: () => void }) {
  const { user, updateLocalUser } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  const myRep = user?.reputation ?? 0;
  const eligible = myRep > TRANSFER_RULES.minBalance;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount < 1 || amount > TRANSFER_RULES.maxPerTransaction) {
      toast.error(t("rep.maxPerTransaction", { max: TRANSFER_RULES.maxPerTransaction }));
      return;
    }
    if (reason.trim().length < 3) {
      toast.error(t("rep.reasonRequired"));
      return;
    }
    setSending(true);
    try {
      const res = await axiosInstance.post("/user/reputation/transfer", { receiverId: receiver._id, amount, reason: reason.trim() });
      updateLocalUser({ reputation: res.data.reputation });
      toast.success(t("rep.transferDone", { amount, name: receiver.name }));
      setOpen(false);
      setReason("");
      onTransferred();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="flex items-center gap-2"
        onClick={() => (eligible ? setOpen(true) : toast.info(t("rep.needMoreToTransfer", { min: TRANSFER_RULES.minBalance })))}
      >
        <Gift className="h-4 w-4 text-orange-600" /> {t("rep.sendReputation")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>{t("rep.sendTo", { name: receiver.name })}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <p className="text-xs text-gray-600">
              {t("rep.transferRules", {
                min: TRANSFER_RULES.minBalance,
                perTx: TRANSFER_RULES.maxPerTransaction,
                perDay: TRANSFER_RULES.maxPerDay,
              })}
            </p>
            <p className="text-sm">
              {t("rep.yourBalance")} <strong>{myRep}</strong>
            </p>
            <div className="space-y-1">
              <Label htmlFor="rep-amount">{t("rep.amount")}</Label>
              <Input
                id="rep-amount"
                type="number"
                min={1}
                max={TRANSFER_RULES.maxPerTransaction}
                value={amount}
                onChange={(e) => setAmount(Math.floor(Number(e.target.value)))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rep-reason">{t("rep.reason")}</Label>
              <Textarea id="rep-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("rep.reasonPlaceholder")} />
            </div>
            <Button type="submit" disabled={sending} className="w-full bg-orange-600 text-white hover:bg-orange-700">
              {sending ? t("common.sending") : t("rep.confirmSend")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
