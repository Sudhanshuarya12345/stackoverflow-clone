import PostCard from "@/components/feed/PostCard";
import PostComposer from "@/components/feed/PostComposer";
import { Button } from "@/components/ui/button";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { Flame, Hash, Users } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

const tabs = [
  { value: "latest", label: "Latest" },
  { value: "trending", label: "Trending" },
  { value: "following", label: "Following" },
];

export default function FeedPage() {
  const router = useRouter();
  const { user, authReady } = useAuth();
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
      toast.success(next ? `Following ${authorName || "user"}` : `Unfollowed ${authorName || "user"}`);
    } catch (error: any) {
      setFollowingIds((prev) => ({ ...prev, [userId]: !next }));
      toast.error(error.response?.data?.message || "Could not update follow");
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
      if (error.response?.status === 401) toast.error("Login to view your following feed");
      else toast.error("Could not load community feed");
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
      <Head><title>Community Feed - StackOverflow</title></Head>
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main className="space-y-5">
          <div className="rounded-3xl bg-gradient-to-br from-orange-600 to-slate-950 p-6 text-white shadow-lg">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-orange-100"><Flame className="h-4 w-4" /> Community Feed</div>
            <h1 className="mt-2 text-3xl font-black">Share what you are building and learning</h1>
            <p className="mt-2 max-w-2xl text-sm text-orange-50">Post updates, images, code snippets, project showcases, and achievements. Follow members to personalize the feed.</p>
          </div>
          {!authReady ? (
            <div className="rounded-2xl border bg-white p-4 text-sm">Loading your session...</div>
          ) : user ? <PostComposer onCreated={(post) => setPosts((prev) => [post, ...prev])} /> : (
            <div className="rounded-2xl border bg-white p-4 text-sm"><Link href="/auth" className="font-semibold text-orange-700">Log in</Link> to post, follow, like, comment, and bookmark.</div>
          )}
          <div className="flex flex-wrap gap-2">
            {tabs.map((item) => (
              <Button key={item.value} type="button" variant="outline" onClick={() => setTab(item.value)} className={tab === item.value ? "border-orange-400 bg-white font-semibold text-orange-700 shadow-sm" : ""}>
                {item.value === "following" && <Users className="h-4 w-4" />} {item.label}
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
            {!loading && posts.length === 0 && <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">No posts yet. Start the conversation.</div>}
            {loading && <div className="rounded-2xl border bg-white p-6 text-center text-slate-500">Loading posts...</div>}
            <div ref={sentinel} className="h-4" />
          </div>
        </main>
        <aside className="space-y-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><Hash className="h-4 w-4 text-blue-600" /> Trending Hashtags</h2>
            <div className="flex flex-wrap gap-2">
              {hashtags.map((item) => (
                <Link key={item.tag} href={`/feed?hashtag=${encodeURIComponent(item.tag)}&tab=${tab}`} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">#{item.tag} ({item.count})</Link>
              ))}
            </div>
          </div>
          {user?.role === "admin" && <Link href="/admin/moderation" className="block rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">Open moderation queue</Link>}
        </aside>
      </div>
    </Mainlayout>
  );
}
