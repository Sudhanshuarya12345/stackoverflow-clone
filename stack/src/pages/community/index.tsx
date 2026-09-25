import Head from "next/head";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Link from "next/link";
import { Crown } from "lucide-react";

export default function CommunityPage() {
  const { user, authReady } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!authReady) return;
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
          toast.error(t("common.error"));
        }
      })
      .finally(() => setLoading(false));
  }, [user, authReady]);

  if (!authReady) {
    return (
      <Mainlayout>
        <div className="max-w-2xl mx-auto py-16 text-center">
          <p className="text-gray-600">{t("common.loading")}</p>
        </div>
      </Mainlayout>
    );
  }

  if (!user) {
    return (
      <Mainlayout>
        <div className="max-w-2xl mx-auto py-16 text-center">
          <p className="text-gray-600">{t("gold.loginRequired")}</p>
          <Link href="/auth" className="mt-4 inline-block text-blue-600 hover:underline">
            {t("nav.login")}
          </Link>
        </div>
      </Mainlayout>
    );
  }

  return (
    <Mainlayout>
      <Head>
        <title>{t("gold.title")}</title>
      </Head>
      <div className="max-w-4xl mx-auto py-4 sm:py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-500" /> {t("gold.title")}
        </h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent"></div>
          </div>
        ) : denied ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-8 text-center">
            <Crown className="w-10 h-10 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-amber-900 mb-2">{t("gold.membersOnly")}</h2>
            <p className="text-sm text-amber-800 mb-4">
              {t("gold.description")}
            </p>
            <Link
              href="/subscription"
              className="inline-block rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              {t("gold.upgrade")}
            </Link>
          </div>
        ) : data?.content ? (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("gold.announcements")}</h2>
              <ul className="space-y-2">
                {data.content.announcements.map((item: string, idx: number) => (
                  <li key={idx} className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
                    {t(`gold.announcement${idx + 1}` as any) || item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("gold.resources")}</h2>
              <ul className="space-y-2">
                {data.content.resources.map((item: string, idx: number) => (
                  <li key={idx} className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
                    {t(`gold.resource${idx + 1}` as any) || item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-gray-500">
              {t("gold.welcome", { count: data.content.memberCount })}
            </p>
          </div>
        ) : (
          <p className="text-gray-500">{t("gold.empty")}</p>
        )}
      </div>
    </Mainlayout>
  );
}