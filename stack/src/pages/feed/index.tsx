import PostCard from "@/components/feed/PostCard";
import PostComposer from "@/components/feed/PostComposer";
import { Button } from "@/components/ui/button";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import { Flame, Hash, Users } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

const tabs = ["latest", "trending", "following"] as const;

export default function FeedPage() {
  const router = useRouter();
  const { user, authReady } = useAuth();
  const { t } = useI18n();
  const [posts, setPosts] = useState<any[]>([]);
  const [hashtags, setHashtags] = useState<any[]>([]);
  const [followingIds, setFollowingIds] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const tab = String(router.query.tab || "latest");
  const hashtag = router.query.hashtag ? String(router.query.hashtag) : "";

  const syncFollowing = (incoming: any[]) => {
    setFollowingIds((prev) => {
      const next = { ...prev };
      incoming.forEach((p) => {
        const id = String(p.author?._id);
        if (id && !(id in next)) next[id] = Boolean(p.isFollowing);
      });
      return next;
    });
  };

  const toggleFollow = async (userId: string) => {
    const next = !followingIds[userId];
    const authorName = posts.find((p) => String(p.author?._id) === userId)?.author?.name;
    setFollowingIds((prev) => ({ ...prev, [userId]: next }));
    try {
      if (next) await axiosInstance.post(`/api/community/follow/${userId}`);
      else await axiosInstance.delete(`/api/community/follow/${userId}`);
      toast.success(next ? t("feed.followingName", { name: authorName }) : t("feed.unfollowed", { name: authorName }));
    } catch (error: any) {
      setFollowingIds((prev) => ({ ...prev, [userId]: !next }));
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  const loadPosts = async (targetPage = 1, append = false) => {
    if (!authReady) return;
    try {
      setLoading(true);
      const res = await axiosInstance.get("/api/community/feed", { params: { tab, hashtag, page: targetPage, limit: 8 } });
      setPosts((prev) => (append ? [...prev, ...res.data.data] : res.data.data));
      syncFollowing(res.data.data);
      setPage(targetPage);
      setHasMore(res.data.hasMore);
    } catch (error: any) {
      if (error.response?.status === 401) toast.error(t("feed.loginForFollowing"));
      else toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts(1, false);
  }, [tab, hashtag, authReady]);

  useEffect(() => {
    axiosInstance.get("/api/community/hashtags").then((res) => setHashtags(res.data.data || [])).catch(() => setHashtags([]));
  }, []);

  useEffect(() => {
    if (!sentinel.current || loading || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadPosts(page + 1, true);
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [page, loading, hasMore, tab, hashtag]);

  const setTab = (value: string) => router.push({ pathname: "/feed", query: { ...router.query, tab: value } });

  return (
    <Mainlayout>
      <Head><title>{t("feed.title")}</title></Head>
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <main className="space-y-5">
          <div className="rounded-3xl bg-gradient-to-br from-orange-600 to-slate-950 p-4 sm:p-6 text-white shadow-lg">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-orange-100"><Flame className="h-4 w-4" /> {t("feed.title")}</div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-black">{t("feed.heroTitle")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-orange-50">{t("feed.heroText")}</p>
          </div>
          {!authReady ? (
            <div className="rounded-2xl border bg-white p-4 text-sm">{t("common.loading")}</div>
          ) : user ? <PostComposer onCreated={(post) => setPosts((prev) => [post, ...prev])} /> : (
            <div className="rounded-2xl border bg-white p-4 text-sm"><Link href="/auth" className="font-semibold text-orange-700">{t("nav.login")}</Link> {t("feed.loginToPost")}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {tabs.map((item) => (
              <Button key={item} type="button" variant="outline" onClick={() => setTab(item)} className={tab === item ? "border-orange-400 bg-white font-semibold text-orange-700 shadow-sm" : ""}>
                {item === "following" && <Users className="h-4 w-4" />} {t(`feed.tab.${item}`)}
              </Button>
            ))}
            {hashtag && <Button type="button" variant="outline" onClick={() => router.push({ pathname: "/feed", query: { tab } })}>#{hashtag} ×</Button>}
          </div>
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post._id}
                post={post}
                isFollowing={Boolean(followingIds[String(post.author?._id)])}
                onToggleFollow={toggleFollow}
                onChange={(updated) => setPosts((prev) => updated ? prev.map((item) => item._id === updated._id ? updated : item) : prev.filter((item) => item._id !== post._id))}
              />
            ))}
            {!loading && posts.length === 0 && <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">{t("feed.empty")}</div>}
            {loading && <div className="rounded-2xl border bg-white p-6 text-center text-slate-500">{t("common.loading")}</div>}
            <div ref={sentinel} className="h-4" />
          </div>
        </main>
        <aside className="space-y-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><Hash className="h-4 w-4 text-blue-600" /> {t("feed.trendingHashtags")}</h2>
            <div className="flex flex-wrap gap-2">
              {hashtags.map((item) => (
                <Link key={item.tag} href={`/feed?hashtag=${encodeURIComponent(item.tag)}&tab=${tab}`} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">#{item.tag} ({item.count})</Link>
              ))}
            </div>
          </div>
          {user?.role === "admin" && <Link href="/admin/moderation" className="block rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">{t("feed.openModeration")}</Link>}
        </aside>
      </div>
    </Mainlayout>
  );
}
