import { Button } from "@/components/ui/button";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

export default function ModerationPage() {
  const { user, authReady } = useAuth();
  const { t, formatDateTime } = useI18n();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await axiosInstance.get("/api/admin/reports", { params: { status: "pending", limit: 25 } });
      setReports(res.data.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authReady && user?.role === "admin") load();
    if (authReady && user?.role !== "admin") setLoading(false);
  }, [authReady, user]);

  const review = async (id: string, action: "dismiss" | "remove") => {
    try {
      const res = await axiosInstance.patch(`/api/admin/reports/${id}`, { action });
      const postId = reports.find((item) => item._id === id)?.postId?._id;
      // Removing a post resolves every pending report that points at it.
      setReports((prev) => prev.filter((item) => item._id !== id && !(action === "remove" && postId && item.postId?._id === postId)));
      toast.success(action === "remove" ? t("mod.removed") : t("mod.dismissed"));
      if (res.data.authorSuspended) toast.warn(t("mod.autoSuspended"));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  const suspend = async (id: string) => {
    const reason = window.prompt(t("mod.suspendReason"), t("mod.defaultReason"));
    if (!reason) return;
    try {
      await axiosInstance.patch(`/api/admin/users/${id}/suspend`, { suspended: true, reason });
      toast.success(t("mod.suspended"));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  if (!authReady || loading) return <Mainlayout><div className="p-8 text-center">{t("common.loading")}</div></Mainlayout>;
  if (user?.role !== "admin") return <Mainlayout><div className="rounded border bg-white p-8 text-center text-slate-600">{t("admin.required")}</div></Mainlayout>;

  return (
    <Mainlayout>
      <Head><title>{t("nav.moderation")}</title></Head>
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-bold">{t("nav.moderation")}</h1>
        {reports.length === 0 ? <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">{t("mod.none")}</div> : reports.map((report) => {
          const post = report.postId;
          const author = post?.author;
          return (
            <div key={report._id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="break-words text-sm font-semibold text-red-700">{t("mod.reason")}: {report.reason}</p>
                  {report.details && <p className="text-sm text-slate-500">{report.details}</p>}
                  <p className="text-xs text-slate-400">{t("mod.reportedBy", { name: report.reporterId?.name || t("feed.member") })} · {formatDateTime(report.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => review(report._id, "dismiss")}>{t("mod.dismiss")}</Button>
                  <Button className="bg-red-600 text-white" onClick={() => review(report._id, "remove")}>{t("mod.remove")}</Button>
                </div>
              </div>
              {post ? (
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm text-slate-800">{post.content || t("mod.noText")}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                    <span>{t("mod.author")}: <Link href={`/users/${author?._id}`} className="font-semibold text-orange-700">{author?.name || "—"}</Link>{author?.removedContentCount ? ` · ${t("mod.priorRemovals", { count: author.removedContentCount })}` : ""}{author?.suspended ? ` · ${t("mod.alreadySuspended")}` : ""}</span>
                    {author?._id && <Button variant="outline" onClick={() => suspend(author._id)}>{t("mod.suspend")}</Button>}
                  </div>
                </div>
              ) : <p className="text-sm text-slate-500">{t("mod.unavailable")}</p>}
            </div>
          );
        })}
      </div>
    </Mainlayout>
  );
}
