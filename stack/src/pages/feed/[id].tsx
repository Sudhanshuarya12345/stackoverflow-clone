import CommentSection from "@/components/feed/CommentSection";
import PostCard from "@/components/feed/PostCard";
import Mainlayout from "@/layout/Mainlayout";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

export default function FeedPostPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { id } = router.query;
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    axiosInstance.get(`/api/community/posts/${id}`)
      .then((res) => setPost(res.data.data))
      .catch(() => toast.error(t("common.error")))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Mainlayout>
      <Head><title>{t("feed.postTitle")}</title></Head>
      <div className="mx-auto max-w-3xl space-y-4">
        {loading ? <div className="rounded-2xl border bg-white p-8 text-center">{t("common.loading")}</div> : post ? (
          <>
            <PostCard post={post} onChange={(updated) => updated ? setPost(updated) : router.push("/feed")} compact />
            <CommentSection post={post} onPostChange={setPost} />
          </>
        ) : <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">{t("feed.notFound")}</div>}
      </div>
    </Mainlayout>
  );
}
