import { Button } from "@/components/ui/button";
import axiosInstance from "@/lib/axiosinstance";
import { useAuth } from "@/lib/AuthContext";
import { Bookmark, Code2, Flag, Heart, MessageCircle, Repeat2, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "react-toastify";

const typeLabel: Record<string, string> = {
  update: "Update",
  showcase: "Showcase",
  project: "Project",
  achievement: "Achievement",
  snippet: "Snippet",
};

export default function PostCard({ post, onChange, compact = false }: { post: any; onChange?: (post: any | null) => void; compact?: boolean }) {
  const { user } = useAuth();
  const author = post.author || {};
  const isOwner = user?._id && String(user._id) === String(author._id || post.author);

  const action = async (fn: () => Promise<any>, fallback: string) => {
    try {
      const res = await fn();
      onChange?.(res.data.data || post);
    } catch (error: any) {
      toast.error(error.response?.data?.message || fallback);
    }
  };

  const report = async () => {
    const reason = window.prompt("Why are you reporting this post?");
    if (!reason) return;
    try {
      await axiosInstance.post(`/api/community/posts/${post._id}/report`, { reason });
      toast.success("Report submitted");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not report post");
    }
  };

  const deletePost = async () => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await axiosInstance.delete(`/api/community/posts/${post._id}`);
      onChange?.(null);
      toast.success("Post deleted");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not delete post");
    }
  };

  const share = async () => {
    await action(() => axiosInstance.post(`/api/community/posts/${post._id}/share`), "Could not share post");
    if (navigator.clipboard) await navigator.clipboard.writeText(`${window.location.origin}/feed/${post._id}`);
    toast.success("Link copied and share counted");
  };

  const follow = async () => {
    try {
      await axiosInstance.post(`/api/community/follow/${author._id}`);
      toast.success(`Following ${author.name}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not follow user");
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href={`/users/${author._id}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-600 font-bold text-white">
              {author.name?.charAt(0)?.toUpperCase() || "U"}
            </Link>
            <div>
              <Link href={`/users/${author._id}`} className="font-semibold text-slate-900 hover:text-orange-700">
                {author.name || "Community member"}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{new Date(post.createdAt).toLocaleString()}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5">{typeLabel[post.type] || "Update"}</span>
                {author.plan && author.plan !== "free" && <span className="uppercase text-orange-700">{author.plan}</span>}
              </div>
            </div>
          </div>
          {user && !isOwner && <Button type="button" size="sm" variant="outline" onClick={follow}>Follow</Button>}
        </div>
        {post.content && <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{post.content}</p>}
        {post.hashtags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.hashtags.map((tag: string) => (
              <Link key={tag} href={`/feed?hashtag=${encodeURIComponent(tag)}`} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                #{tag}
              </Link>
            ))}
          </div>
        )}
        {post.images?.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {post.images.map((image: any) => <img key={image.publicId || image.url} src={image.url} alt="Community post" className="max-h-80 w-full rounded-xl object-cover" />)}
          </div>
        )}
        {post.code?.code && (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-300"><Code2 className="h-4 w-4" /> {post.code.language || "text"}</div>
            <pre className="overflow-x-auto p-4 text-sm text-slate-100"><code>{post.code.code}</code></pre>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-4 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => action(() => axiosInstance.patch(`/api/community/posts/${post._id}/like`), "Could not like post")}>
            <Heart className={`mr-1 h-4 w-4 ${post.likedByMe ? "fill-red-500 text-red-500" : ""}`} /> {post.likesCount ?? post.likes?.length ?? 0}
          </Button>
          <Link href={`/feed/${post._id}`} className="inline-flex items-center rounded px-3 py-2 hover:bg-white">
            <MessageCircle className="mr-1 h-4 w-4" /> {post.commentsCount ?? post.comments?.length ?? 0}
          </Link>
          <Button type="button" variant="ghost" size="sm" onClick={share}><Repeat2 className="mr-1 h-4 w-4" /> {post.shares || 0}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => action(() => axiosInstance.patch(`/api/community/posts/${post._id}/bookmark`), "Could not bookmark post")}>
            <Bookmark className={`mr-1 h-4 w-4 ${post.bookmarkedByMe ? "fill-orange-500 text-orange-500" : ""}`} /> Save
          </Button>
        </div>
        {!compact && (
          <div className="flex items-center gap-1">
            {isOwner && <Button type="button" variant="ghost" size="sm" onClick={deletePost}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>}
            {!isOwner && user && <Button type="button" variant="ghost" size="sm" onClick={report}><Flag className="mr-1 h-4 w-4" /> Report</Button>}
          </div>
        )}
      </div>
    </article>
  );
}
