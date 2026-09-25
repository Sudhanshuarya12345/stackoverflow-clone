import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import axiosInstance from "@/lib/axiosinstance";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { Bookmark, Code2, Edit, Flag, Heart, MessageCircle, Repeat2, Trash2, UserCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "react-toastify";

export const POST_TYPES = ["update", "showcase", "project", "achievement", "snippet"] as const;
const EDIT_OTHERS_THRESHOLD = 100;
const REPORT_THRESHOLD = 500;

export default function PostCard({
  post,
  onChange,
  compact = false,
  isFollowing,
  onToggleFollow,
}: {
  post: any;
  onChange?: (post: any | null) => void;
  compact?: boolean;
  isFollowing?: boolean;
  onToggleFollow?: (userId: string) => void;
}) {
  const { user } = useAuth();
  const { t, formatDateTime } = useI18n();
  const author = post.author || {};
  const isOwner = Boolean(user?._id && String(user._id) === String(author._id || post.author));
  const isAdmin = user?.role === "admin";
  const reputation = user?.reputation ?? 0;
  const canEdit = Boolean(user) && (isOwner || isAdmin || reputation >= EDIT_OTHERS_THRESHOLD);
  const [localFollowing, setLocalFollowing] = useState(Boolean(post.isFollowing));
  const following = onToggleFollow ? Boolean(isFollowing) : localFollowing;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ content: "", type: "update", code: "", language: "text" });
  const [saving, setSaving] = useState(false);

  const action = async (fn: () => Promise<any>, fallback: string) => {
    if (!user) {
      toast.info(t("common.loginToContinue"));
      return;
    }
    try {
      const res = await fn();
      onChange?.(res.data.data || post);
    } catch (error: any) {
      toast.error(error.response?.data?.message || fallback);
    }
  };

  const report = async () => {
    if (!isAdmin && reputation < REPORT_THRESHOLD) {
      toast.info(t("feed.reportNeedsRep", { min: REPORT_THRESHOLD }));
      return;
    }
    const reason = window.prompt(t("feed.reportPrompt"));
    if (!reason) return;
    try {
      await axiosInstance.post(`/api/community/posts/${post._id}/report`, { reason });
      toast.success(t("feed.reportSubmitted"));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  const deletePost = async () => {
    if (!window.confirm(isOwner ? t("feed.confirmDelete") : t("feed.confirmRemove"))) return;
    try {
      await axiosInstance.delete(`/api/community/posts/${post._id}`);
      onChange?.(null);
      toast.success(t("feed.deleted"));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  const openEditor = () => {
    setDraft({ content: post.content || "", type: post.type || "update", code: post.code?.code || "", language: post.code?.language || "text" });
    setEditing(true);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await axiosInstance.patch(`/api/community/posts/${post._id}`, {
        content: draft.content,
        type: draft.type,
        keepImageIds: (post.images || []).map((image: any) => image.publicId),
        code: { code: draft.code, language: draft.language },
      });
      onChange?.(res.data.data);
      setEditing(false);
      toast.success(t("feed.updated"));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const share = async () => {
    await action(() => axiosInstance.post(`/api/community/posts/${post._id}/share`), t("common.error"));
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(`${window.location.origin}/feed/${post._id}`);
      if (user) toast.success(t("feed.shared"));
    } catch {
      // Clipboard can be blocked; the share was still counted.
    }
  };

  const follow = async () => {
    if (onToggleFollow) {
      onToggleFollow(String(author._id));
      return;
    }
    try {
      if (localFollowing) {
        await axiosInstance.delete(`/api/community/follow/${author._id}`);
        setLocalFollowing(false);
        toast.success(t("feed.unfollowed", { name: author.name }));
      } else {
        await axiosInstance.post(`/api/community/follow/${author._id}`);
        setLocalFollowing(true);
        toast.success(t("feed.followingName", { name: author.name }));
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={`/users/${author._id}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-600 font-bold text-white">
              {author.name?.charAt(0)?.toUpperCase() || "U"}
            </Link>
            <div className="min-w-0">
              <Link href={`/users/${author._id}`} className="break-words font-semibold text-slate-900 hover:text-orange-700">
                {author.name || t("feed.member")}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{formatDateTime(post.createdAt)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5">{t(`postType.${post.type || "update"}` as any)}</span>
                {author.plan && author.plan !== "free" && <span className="uppercase text-orange-700">{t(`plan.${author.plan}` as any)}</span>}
                {post.createdAt !== post.updatedAt && post.updatedAt && <span className="italic">{t("feed.edited")}</span>}
              </div>
            </div>
          </div>
          {user && !isOwner && (
            <Button type="button" size="sm" variant="outline" onClick={follow} className={following ? "shrink-0 border-orange-400 bg-white text-orange-700" : "shrink-0"}>
              {following ? <UserCheck className="h-4 w-4 sm:mr-1" /> : <UserPlus className="h-4 w-4 sm:mr-1" />}
              <span className="hidden sm:inline">{following ? t("feed.unfollow") : t("feed.follow")}</span>
            </Button>
          )}
        </div>
        {post.content && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{post.content}</p>}
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
            {post.images.map((image: any) => (
              <img key={image.publicId || image.url} src={image.url} alt={t("feed.imageAlt")} loading="lazy" className="max-h-80 w-full rounded-xl object-cover" />
            ))}
          </div>
        )}
        {post.code?.code && (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-300">
              <Code2 className="h-4 w-4" /> {post.code.language || "text"}
            </div>
            <pre className="overflow-x-auto p-4 text-sm text-slate-100">
              <code>{post.code.code}</code>
            </pre>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-2 sm:px-4 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="ghost" size="sm" aria-label={t("feed.like")} onClick={() => action(() => axiosInstance.patch(`/api/community/posts/${post._id}/like`), t("common.error"))}>
            <Heart className={`mr-1 h-4 w-4 ${post.likedByMe ? "fill-red-500 text-red-500" : ""}`} /> {post.likesCount ?? post.likes?.length ?? 0}
          </Button>
          <Link href={`/feed/${post._id}`} className="inline-flex items-center rounded px-3 py-2 hover:bg-white" aria-label={t("feed.comments")}>
            <MessageCircle className="mr-1 h-4 w-4" /> {post.commentsCount ?? post.comments?.length ?? 0}
          </Link>
          <Button type="button" variant="ghost" size="sm" onClick={share} aria-label={t("feed.share")}>
            <Repeat2 className="mr-1 h-4 w-4" /> {post.shares || 0}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => action(() => axiosInstance.patch(`/api/community/posts/${post._id}/bookmark`), t("common.error"))}>
            <Bookmark className={`mr-1 h-4 w-4 ${post.bookmarkedByMe ? "fill-orange-500 text-orange-500" : ""}`} /> {t("feed.save")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {canEdit && (
            <Button type="button" variant="ghost" size="sm" onClick={openEditor}>
              <Edit className="mr-1 h-4 w-4" /> {t("common.edit")}
            </Button>
          )}
          {!compact && (isOwner || isAdmin) && (
            <Button type="button" variant="ghost" size="sm" onClick={deletePost}>
              <Trash2 className="mr-1 h-4 w-4" /> {t("common.delete")}
            </Button>
          )}
          {!compact && !isOwner && user && (
            <Button type="button" variant="ghost" size="sm" onClick={report}>
              <Flag className="mr-1 h-4 w-4" /> {t("feed.report")}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-xl bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>{t("feed.editPost")}</DialogTitle>
          </DialogHeader>
          {!isOwner && <p className="text-xs text-amber-700">{t("feed.editingOthers", { min: EDIT_OTHERS_THRESHOLD })}</p>}
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {POST_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, type: value }))}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${draft.type === value ? "bg-orange-600 text-white" : "bg-orange-50 text-orange-800"}`}
                >
                  {t(`postType.${value}`)}
                </button>
              ))}
            </div>
            <Textarea value={draft.content} onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))} className="min-h-28" />
            {(draft.code || post.code?.code) && (
              <Textarea
                value={draft.code}
                onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                className="min-h-24 font-mono text-sm"
              />
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving} className="bg-orange-600 text-white hover:bg-orange-700">
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}
