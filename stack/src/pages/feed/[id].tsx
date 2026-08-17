import CommentSection from "@/components/feed/CommentSection";
import PostCard from "@/components/feed/PostCard";
import Mainlayout from "@/layout/Mainlayout";
import axiosInstance from "@/lib/axiosinstance";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

export default function FeedPostPage() {
  const router = useRouter();
  const { id } = router.query;
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    axiosInstance.get(`/api/community/posts/${id}`)
      .then((res) => setPost(res.data.data))
      .catch(() => toast.error("Could not load post"))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Mainlayout>
      <Head><title>Community Post - StackOverflow</title></Head>
      <div className="mx-auto max-w-3xl space-y-4">
        {loading ? <div className="rounded-2xl border bg-white p-8 text-center">Loading...</div> : post ? (
          <>
            <PostCard post={post} onChange={(updated) => updated ? setPost(updated) : router.push("/feed")} compact />
            <CommentSection post={post} onPostChange={setPost} />
          </>
        ) : <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">Post not found.</div>}
      </div>
    </Mainlayout>
  );
}
