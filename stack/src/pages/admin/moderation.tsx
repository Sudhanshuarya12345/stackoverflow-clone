import { Button } from "@/components/ui/button";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

export default function ModerationPage() {
  const { user, authReady } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await axiosInstance.get("/api/admin/reports", { params: { status: "pending", limit: 25 } });
      setReports(res.data.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authReady && user?.role === "admin") load();
    if (authReady && user?.role !== "admin") setLoading(false);
  }, [authReady, user]);

  const review = async (id: string, action: "dismiss" | "remove") => {
    await axiosInstance.patch(`/api/admin/reports/${id}`, { action });
    setReports((prev) => prev.filter((item) => item._id !== id));
    toast.success(action === "remove" ? "Post removed" : "Report dismissed");
  };

  const suspend = async (id: string) => {
    const reason = window.prompt("Suspension reason", "Community policy violation");
    if (!reason) return;
    await axiosInstance.patch(`/api/admin/users/${id}/suspend`, { suspended: true, reason });
    toast.success("User suspended");
  };

  if (!authReady || loading) return <Mainlayout><div className="p-8 text-center">Loading...</div></Mainlayout>;
  if (user?.role !== "admin") return <Mainlayout><div className="rounded border bg-white p-8 text-center text-slate-600">Administrator access required.</div></Mainlayout>;

  return (
    <Mainlayout>
      <Head><title>Moderation - StackOverflow</title></Head>
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-bold">Community Moderation</h1>
        {reports.length === 0 ? <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">No pending reports.</div> : reports.map((report) => {
          const post = report.postId;
          const author = post?.author;
          return (
            <div key={report._id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-red-700">Reason: {report.reason}</p>
                  {report.details && <p className="text-sm text-slate-500">{report.details}</p>}
                  <p className="text-xs text-slate-400">Reported by {report.reporterId?.name || "member"} · {new Date(report.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => review(report._id, "dismiss")}>Dismiss</Button>
                  <Button className="bg-red-600 text-white" onClick={() => review(report._id, "remove")}>Remove post</Button>
                </div>
              </div>
              {post ? (
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm text-slate-800">{post.content || "No text content"}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                    <span>Author: <Link href={`/users/${author?._id}`} className="font-semibold text-orange-700">{author?.name || "unknown"}</Link></span>
                    {author?._id && <Button variant="outline" onClick={() => suspend(author._id)}>Suspend author</Button>}
                  </div>
                </div>
              ) : <p className="text-sm text-slate-500">Post already unavailable.</p>}
            </div>
          );
        })}
      </div>
    </Mainlayout>
  );
}
