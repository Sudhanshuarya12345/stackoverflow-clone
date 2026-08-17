import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import axiosInstance from "@/lib/axiosinstance";
import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";
import { toast } from "react-toastify";

export default function CommentSection({ post, onPostChange }: { post: any; onPostChange: (post: any) => void }) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [replyBody, setReplyBody] = useState<Record<string, string>>({});

  const submitComment = async () => {
    if (!user) return toast.error("Login to comment");
    try {
      const res = await axiosInstance.post(`/api/community/posts/${post._id}/comments`, { body });
      onPostChange(res.data.data);
      setBody("");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not comment");
    }
  };

  const submitReply = async (commentId: string) => {
    if (!user) return toast.error("Login to reply");
    try {
      const res = await axiosInstance.post(`/api/community/posts/${post._id}/comments/${commentId}/replies`, { body: replyBody[commentId] });
      onPostChange(res.data.data);
      setReplyBody((prev) => ({ ...prev, [commentId]: "" }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not reply");
    }
  };

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-slate-900">Comments</h2>
      <div className="mb-6 space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment or @mention another member" />
        <Button onClick={submitComment} variant="outline" className="border-orange-300 bg-white text-orange-700 hover:bg-orange-50">Comment</Button>
      </div>
      <div className="space-y-4">
        {(post.comments || []).map((comment: any) => (
          <div key={comment._id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-sm text-slate-800">{comment.body}</p>
            <p className="mt-1 text-xs text-slate-500">{comment.user?.name || "Member"} · {new Date(comment.createdAt).toLocaleString()}</p>
            <div className="ml-4 mt-3 space-y-2">
              {(comment.replies || []).map((reply: any) => (
                <div key={reply._id} className="rounded-lg bg-white p-2 text-sm">
                  <p>{reply.body}</p>
                  <p className="mt-1 text-xs text-slate-500">{reply.user?.name || "Member"} · {new Date(reply.createdAt).toLocaleString()}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={replyBody[comment._id] || ""}
                  onChange={(e) => setReplyBody((prev) => ({ ...prev, [comment._id]: e.target.value }))}
                  placeholder="Reply..."
                  className="flex-1 rounded border px-3 py-2 text-sm"
                />
                <Button type="button" variant="outline" onClick={() => submitReply(comment._id)}>Reply</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
