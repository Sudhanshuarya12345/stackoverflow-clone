import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES } from "@/locales";
import { Globe, History, Laptop, LogOut, Monitor, ShieldCheck, Smartphone, Tablet, Trash2 } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

const DeviceIcon = ({ type }: { type?: string }) => {
  if (type === "mobile") return <Smartphone className="h-5 w-5 text-gray-500" />;
  if (type === "tablet") return <Tablet className="h-5 w-5 text-gray-500" />;
  if (type === "desktop") return <Laptop className="h-5 w-5 text-gray-500" />;
  return <Monitor className="h-5 w-5 text-gray-500" />;
};

export default function SettingsPage() {
  const { user, authReady } = useAuth();
  const { t, language, formatDateTime } = useI18n();
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [inactivityMinutes, setInactivityMinutes] = useState<number | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadSecurity = useCallback(async () => {
    try {
      const [s, d, h] = await Promise.all([
        axiosInstance.get("/user/sessions"),
        axiosInstance.get("/user/trusted-devices"),
        axiosInstance.get("/user/login-history", { params: { page: 1, limit: 10 } }),
      ]);
      setSessions(s.data.data || []);
      setInactivityMinutes(s.data.inactivityMinutes);
      setDevices(d.data.data || []);
      setHistory(h.data.data || []);
      setHistoryPage(1);
      setHistoryPages(h.data.totalPages || 1);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authReady && user) loadSecurity();
    if (authReady && !user) setLoading(false);
  }, [authReady, Boolean(user)]);

  const loadMoreHistory = async () => {
    const next = historyPage + 1;
    const res = await axiosInstance.get("/user/login-history", { params: { page: next, limit: 10 } });
    setHistory((prev) => [...prev, ...(res.data.data || [])]);
    setHistoryPage(next);
    setHistoryPages(res.data.totalPages || 1);
  };

  const revoke = async (id: string, current: boolean) => {
    if (!window.confirm(t(current ? "security.confirmRevokeCurrent" : "security.confirmRevoke"))) return;
    try {
      await axiosInstance.delete(`/user/sessions/${id}`);
      if (current) {
        localStorage.removeItem("user");
        window.dispatchEvent(new Event("auth:logout"));
        router.push("/auth");
        return;
      }
      setSessions((prev) => prev.filter((s) => s._id !== id));
      toast.success(t("security.revoked"));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  const revokeOthers = async () => {
    if (!window.confirm(t("security.confirmRevokeOthers"))) return;
    try {
      const res = await axiosInstance.post("/user/sessions/revoke-others");
      setSessions((prev) => prev.filter((s) => s.current));
      toast.success(t("security.revokedOthers", { count: res.data.count }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  const forgetDevice = async (id: string) => {
    try {
      await axiosInstance.delete(`/user/trusted-devices/${id}`);
      setDevices((prev) => prev.filter((d) => d._id !== id));
      toast.success(t("security.deviceRemoved"));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  if (!authReady || loading) {
    return (
      <Mainlayout>
        <div className="p-8 text-center text-gray-600">{t("common.loading")}</div>
      </Mainlayout>
    );
  }
  if (!user) {
    return (
      <Mainlayout>
        <div className="p-8 text-center text-gray-600">
          {t("common.loginRequired")}{" "}
          <Link href="/auth" className="text-blue-600 hover:underline">
            {t("nav.login")}
          </Link>
        </div>
      </Mainlayout>
    );
  }

  const currentLanguage = LANGUAGES.find((l) => l.code === language);

  return (
    <Mainlayout>
      <Head>
        <title>{t("settings.title")}</title>
      </Head>
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("settings.title")}</h1>

        <section className="rounded-lg border bg-white p-4 sm:p-6">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
            <Globe className="h-5 w-5 text-blue-600" /> {t("settings.languageTitle")}
          </h2>
          <p className="text-sm text-gray-600">{t("settings.languageText")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm">
              {t("settings.currentLanguage")} <strong>{currentLanguage?.nativeName}</strong>
            </span>
            <div className="rounded border">
              <LanguageSwitcher />
            </div>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-500">
            <li>{t("settings.frenchRule")}</li>
            <li>{t("settings.otherRule")}</li>
          </ul>
          {!user.phone && (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              {t("settings.noPhone")}{" "}
              <Link href={`/users/${user._id}?edit=phone`} className="font-medium text-blue-600 hover:underline">
                {t("settings.addPhone")}
              </Link>
            </p>
          )}
        </section>

        <section id="security" className="rounded-lg border bg-white p-4 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-5 w-5 text-green-600" /> {t("security.activeSessions")}
            </h2>
            {sessions.length > 1 && (
              <Button variant="outline" size="sm" onClick={revokeOthers}>
                <LogOut className="mr-1 h-4 w-4" /> {t("security.signOutOthers")}
              </Button>
            )}
          </div>
          {inactivityMinutes && <p className="mb-3 text-xs text-gray-500">{t("security.inactivityNote", { minutes: inactivityMinutes })}</p>}
          <ul className="divide-y rounded border">
            {sessions.map((s) => (
              <li key={s._id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <DeviceIcon type={s.deviceType} />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-gray-900">
                      {s.browser} · {s.os}{" "}
                      {s.current && (
                        <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          {t("security.thisDevice")}
                        </span>
                      )}
                    </p>
                    <p className="break-words text-xs text-gray-500">
                      {t(`device.${s.deviceType}` as any)} · {s.ip || "—"} · {s.location || t("security.unknownLocation")}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t("security.signedIn")} {formatDateTime(s.createdAt)} · {t("security.lastActive")} {formatDateTime(s.lastActiveAt)}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="self-start text-red-600 sm:self-center" onClick={() => revoke(s._id, s.current)}>
                  {t("security.revoke")}
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border bg-white p-4 sm:p-6">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
            <Laptop className="h-5 w-5 text-gray-600" /> {t("security.trustedDevices")}
          </h2>
          <p className="mb-3 text-xs text-gray-500">{t("security.trustedText")}</p>
          {devices.length === 0 ? (
            <p className="text-sm text-gray-500">{t("security.noTrusted")}</p>
          ) : (
            <ul className="divide-y rounded border">
              {devices.map((d) => (
                <li key={d._id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{d.label}</p>
                    <p className="text-xs text-gray-500">
                      {t("security.lastUsed")} {formatDateTime(d.lastUsedAt)} · {t("security.trustedUntil")} {formatDateTime(d.expiresAt)}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => forgetDevice(d._id)} aria-label={t("security.forget")}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border bg-white p-4 sm:p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <History className="h-5 w-5 text-gray-600" /> {t("security.loginHistory")}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-3">{t("security.colTime")}</th>
                  <th className="py-2 pr-3">{t("security.colBrowser")}</th>
                  <th className="py-2 pr-3">{t("security.colOs")}</th>
                  <th className="py-2 pr-3">{t("security.colDevice")}</th>
                  <th className="py-2 pr-3">{t("security.colIp")}</th>
                  <th className="py-2 pr-3">{t("security.colLocation")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((h) => (
                  <tr key={h._id}>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {formatDateTime(h.createdAt)}
                      {h.newDevice && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{t("security.newDevice")}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{h.browser}</td>
                    <td className="py-2 pr-3">{h.os}</td>
                    <td className="py-2 pr-3">{t(`device.${h.deviceType}` as any)}</td>
                    <td className="py-2 pr-3">{h.ip || "—"}</td>
                    <td className="py-2 pr-3">{h.location || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {historyPage < historyPages && (
            <div className="mt-3 text-center">
              <Button variant="outline" size="sm" onClick={loadMoreHistory}>
                {t("common.loadMore")}
              </Button>
            </div>
          )}
        </section>
      </div>
    </Mainlayout>
  );
}
