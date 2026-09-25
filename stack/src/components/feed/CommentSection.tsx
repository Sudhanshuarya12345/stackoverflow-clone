import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import axiosInstance from "@/lib/axiosinstance";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";
import { toast } from "react-toastify";

const COMMENT_THRESHOLD = 50;

export default function CommentSection({ post, onPostChange }: { post: any; onPostChange: (post: any) => void }) {
  const { user } = useAuth();
  const { t, formatDateTime } = useI18n();
  const [body, setBody] = useState("");
  const [replyBody, setReplyBody] = useState<Record<string, string>>({});
  const isPostOwner = Boolean(user && String(user._id) === String(post.author?._id || post.author));
  const restricted = Boolean(user) && !isPostOwner && user.role !== "admin" && (user.reputation ?? 0) < COMMENT_THRESHOLD;

  const submitComment = async () => {
    if (!user) return toast.error(t("common.loginToContinue"));
    if (!body.trim()) return;
    try {
      const res = await axiosInstance.post(`/api/community/posts/${post._id}/comments`, { body });
      onPostChange(res.data.data);
      setBody("");
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  const submitReply = async (commentId: string) => {
    if (!user) return toast.error(t("common.loginToContinue"));
    if (!replyBody[commentId]?.trim()) return;
    try {
      const res = await axiosInstance.post(`/api/community/posts/${post._id}/comments/${commentId}/replies`, { body: replyBody[commentId] });
      onPostChange(res.data.data);
      setReplyBody((prev) => ({ ...prev, [commentId]: "" }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  const authorLink = (person: any) =>
    person?._id ? (
      <Link href={`/users/${person._id}`} className="text-blue-600 hover:underline">
        {person.name}
      </Link>
    ) : (
      t("feed.member")
    );

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-slate-900">{t("feed.comments")}</h2>
      {restricted && <p className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-800">{t("feed.commentRestricted", { min: COMMENT_THRESHOLD })}</p>}
      <div className="mb-6 space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("feed.commentPlaceholder")} />
        <Button onClick={submitComment} variant="outline" className="border-orange-300 bg-white text-orange-700 hover:bg-orange-50">
          {t("feed.comment")}
        </Button>
      </div>
      <div className="space-y-4">
        {(post.comments || []).map((comment: any) => (
          <div key={comment._id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="break-words text-sm text-slate-800">{comment.body}</p>
            <p className="mt-1 text-xs text-slate-500">
              {authorLink(comment.user)} · {formatDateTime(comment.createdAt)}
            </p>
            <div className="ml-2 sm:ml-4 mt-3 space-y-2">
              {(comment.replies || []).map((reply: any) => (
                <div key={reply._id} className="rounded-lg bg-white p-2 text-sm">
                  <p className="break-words">{reply.body}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {authorLink(reply.user)} · {formatDateTime(reply.createdAt)}
                  </p>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={replyBody[comment._id] || ""}
                  onChange={(e) => setReplyBody((prev) => ({ ...prev, [comment._id]: e.target.value }))}
                  placeholder={t("feed.replyPlaceholder")}
                  className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
                />
                <Button type="button" variant="outline" onClick={() => submitReply(comment._id)}>
                  {t("feed.reply")}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
