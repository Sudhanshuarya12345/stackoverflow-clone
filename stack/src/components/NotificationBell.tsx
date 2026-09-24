import axiosInstance from "@/lib/axiosinstance";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function NotificationBell({ enabled }: { enabled: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await axiosInstance.get("/api/notifications/unread-count");
        if (alive) setCount(res.data.count || 0);
      } catch {
        if (alive) setCount(0);
      }
    };
    load();
    const timer = setInterval(load, 45000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <Link href="/notifications" className="relative rounded-full p-2 text-slate-700 hover:bg-slate-100" aria-label="Notifications">
      <Bell className="h-5 w-5" />
      {count > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
