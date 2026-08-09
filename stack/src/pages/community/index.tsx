import Head from "next/head";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Link from "next/link";
import { Crown } from "lucide-react";

export default function CommunityPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    axiosInstance
      .get("/api/community/exclusive")
      .then((res) => setData(res.data))
      .catch((error: any) => {
        if (error.response?.status === 403) {
          setDenied(true);
        } else {
          toast.error("Failed to load community");
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) {
    return (
      <Mainlayout>
        <div className="max-w-2xl mx-auto py-16 text-center">
          <p className="text-gray-600">Please log in to access the exclusive community.</p>
          <Link href="/auth" className="mt-4 inline-block text-blue-600 hover:underline">
            Log in
          </Link>
        </div>
      </Mainlayout>
    );
  }

  return (
    <Mainlayout>
      <Head>
        <title>Exclusive Community - StackOverflow</title>
      </Head>
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-500" /> Exclusive Gold Community
        </h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
          </div>
        ) : denied ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-8 text-center">
            <Crown className="w-10 h-10 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-amber-900 mb-2">This area is for Gold members only</h2>
            <p className="text-sm text-amber-800 mb-4">
              The exclusive community includes private announcements, premium resources, and priority access.
            </p>
            <Link
              href="/subscription"
              className="inline-block rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Upgrade to Gold
            </Link>
          </div>
        ) : data?.content ? (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Announcements</h2>
              <ul className="space-y-2">
                {data.content.announcements.map((item: string, idx: number) => (
                  <li key={idx} className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Exclusive Resources</h2>
              <ul className="space-y-2">
                {data.content.resources.map((item: string, idx: number) => (
                  <li key={idx} className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-gray-500">
              Welcome! {data.content.memberCount} premium members are part of the community.
            </p>
          </div>
        ) : (
          <p className="text-gray-500">No community content available.</p>
        )}
      </div>
    </Mainlayout>
  );
}