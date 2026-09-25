import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import { Activity } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

export default function LoginActivityPage() {
  const { user, authReady } = useAuth();
  const { t, formatDateTime } = useI18n();
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [email, setEmail] = useState("");
  const [newOnly, setNewOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (targetPage = 1) => {
      setLoading(true);
      try {
        const res = await axiosInstance.get("/api/admin/login-activity", {
          params: { page: targetPage, limit: 25, email: email.trim() || undefined, newDevice: newOnly ? "true" : undefined },
        });
        setRows(res.data.data || []);
        setPage(targetPage);
        setTotalPages(res.data.totalPages || 1);
        setTotal(res.data.total || 0);
      } catch (error: any) {
        toast.error(error.response?.data?.message || t("common.error"));
      } finally {
        setLoading(false);
      }
    },
    [email, newOnly, t]
  );

  useEffect(() => {
    if (authReady && user?.role === "admin") load(1);
    else if (authReady) setLoading(false);
  }, [authReady, user?.role, newOnly]);

  if (!authReady) return <Mainlayout><div className="p-8 text-center">{t("common.loading")}</div></Mainlayout>;
  if (user?.role !== "admin") {
    return (
      <Mainlayout>
        <div className="rounded border bg-white p-8 text-center text-slate-600">{t("admin.required")}</div>
      </Mainlayout>
    );
  }

  return (
    <Mainlayout>
      <Head>
        <title>{t("admin.loginActivityTitle")}</title>
      </Head>
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Activity className="h-6 w-6 text-red-500" /> {t("admin.loginActivityTitle")}
        </h1>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            load(1);
          }}
        >
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("admin.filterEmail")} className="sm:max-w-xs" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={newOnly} onChange={(e) => setNewOnly(e.target.checked)} /> {t("admin.newDevicesOnly")}
          </label>
          <Button type="submit" variant="outline">
            {t("common.apply")}
          </Button>
          <span className="text-sm text-gray-500 sm:ml-auto">{t("admin.totalLogins", { count: total })}</span>
        </form>
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="p-2">{t("security.colTime")}</th>
                <th className="p-2">{t("admin.colUser")}</th>
                <th className="p-2">{t("admin.colMethod")}</th>
                <th className="p-2">{t("security.colBrowser")}</th>
                <th className="p-2">{t("security.colOs")}</th>
                <th className="p-2">{t("security.colDevice")}</th>
                <th className="p-2">{t("security.colIp")}</th>
                <th className="p-2">{t("security.colLocation")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500">
                    {t("admin.noActivity")}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r._id}>
                    <td className="whitespace-nowrap p-2">
                      {formatDateTime(r.createdAt)}
                      {r.newDevice && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{t("security.newDevice")}</span>
                      )}
                    </td>
                    <td className="p-2">
                      {r.user ? (
                        <Link href={`/users/${r.user._id}`} className="text-blue-600 hover:underline">
                          {r.user.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      <div className="text-xs text-gray-500">{r.user?.email}</div>
                    </td>
                    <td className="p-2">{t(`loginMethod.${r.method}` as any)}</td>
                    <td className="p-2">{r.browser}</td>
                    <td className="p-2">{r.os}</td>
                    <td className="p-2">{t(`device.${r.deviceType}` as any)}</td>
                    <td className="p-2">{r.ip || "—"}</td>
                    <td className="p-2">{r.location || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>
            {t("common.previous")}
          </Button>
          <span className="text-sm text-gray-600">{t("common.pageOf", { page, total: totalPages })}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => load(page + 1)}>
            {t("common.next")}
          </Button>
        </div>
      </div>
    </Mainlayout>
  );
}
