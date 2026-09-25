import { Button } from "@/components/ui/button";
import Mainlayout from "@/layout/Mainlayout";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import { Bell, CheckCheck } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";


export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { t, formatDateTime } = useI18n();
  const messageFor = (item: any) => t(`notif.${item.type}` as any, { name: item.actor?.name || t("notif.someone") });

  const load = async () => {
    try {
      const res = await axiosInstance.get("/api/notifications", { params: { limit: 25 } });
      setItems(res.data.data || []);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markAll = async () => {
    await axiosInstance.patch("/api/notifications/read-all");
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  return (
    <Mainlayout>
      <Head><title>{t("nav.notifications")}</title></Head>
      <div className="mx-auto max-w-3xl rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b p-4">
          <h1 className="flex items-center gap-2 text-xl font-bold"><Bell className="h-5 w-5 text-orange-600" /> {t("nav.notifications")}</h1>
          <Button type="button" variant="outline" onClick={markAll}><CheckCheck className="h-4 w-4" /> <span className="hidden sm:inline">{t("notif.markAll")}</span></Button>
        </div>
        {loading ? <div className="p-8 text-center text-slate-500">{t("common.loading")}</div> : items.length === 0 ? <div className="p-8 text-center text-slate-500">{t("notif.none")}</div> : (
          <div className="divide-y">
            {items.map((item) => (
              <Link key={item._id} href={item.postId?._id ? `/feed/${item.postId._id}` : `/users/${item.actor?._id}`} className={`block p-4 hover:bg-orange-50 ${!item.read ? "bg-orange-50/60" : ""}`}>
                <p className="font-medium text-slate-900">{messageFor(item)}</p>
                {item.postId?.content && <p className="mt-1 line-clamp-1 text-sm text-slate-500">{item.postId.content}</p>}
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.createdAt)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Mainlayout>
  );
}
