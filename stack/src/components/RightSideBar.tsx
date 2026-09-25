import React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { Award, Eye, Flame, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const RightSideBar = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <aside className="w-72 p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="space-y-4 lg:space-y-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 lg:p-4">
          <h3 className="flex items-center gap-2 font-semibold text-gray-800 mb-3 text-sm lg:text-base">
            <Award className="h-4 w-4 text-amber-600" /> {t("side.reputationTitle")}
          </h3>
          {user ? (
            <p className="text-sm text-gray-700">
              {t("side.yourReputation")} <span className="font-bold text-gray-900">{user.reputation ?? 0}</span>
            </p>
          ) : null}
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            <li>{t("side.repAnswer")}</li>
            <li>{t("side.repAccepted")}</li>
            <li>{t("side.repDownvote")}</li>
          </ul>
          {user && (
            <Link href={`/users/${user._id}#reputation`} className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline">
              {t("side.viewHistory")}
            </Link>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded p-3 lg:p-4">
          <h3 className="flex items-center gap-2 font-semibold text-gray-800 mb-3 text-sm lg:text-base">
            <Flame className="h-4 w-4 text-orange-500" /> {t("side.communityTitle")}
          </h3>
          <p className="text-xs text-gray-600">{t("side.communityText")}</p>
          <Link href="/feed" className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline">
            {t("side.openFeed")}
          </Link>
        </div>

        {user && (
          <div className="bg-white border border-gray-200 rounded p-3 lg:p-4">
            <h3 className="flex items-center gap-2 font-semibold text-gray-800 mb-3 text-sm lg:text-base">
              <ShieldCheck className="h-4 w-4 text-green-600" /> {t("side.securityTitle")}
            </h3>
            <p className="text-xs text-gray-600">{t("side.securityText")}</p>
            <Link href="/settings#security" className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline">
              {t("side.manageSessions")}
            </Link>
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 lg:p-4">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm lg:text-base">{t("side.blogTitle")}</h3>
          <ul className="space-y-2 text-xs lg:text-sm">
            <li className="flex items-start">
              <span className="text-gray-400 mr-2">✏️</span>
              <span className="text-gray-700">{t("side.blog1")}</span>
            </li>
            <li className="flex items-start">
              <span className="text-gray-400 mr-2">✏️</span>
              <span className="text-gray-700">{t("side.blog2")}</span>
            </li>
          </ul>
        </div>

        <div className="bg-white border border-gray-200 rounded p-3 lg:p-4">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm lg:text-base">{t("side.metaTitle")}</h3>
          <ul className="space-y-2 text-xs lg:text-sm">
            <li className="flex items-start">
              <span className="text-blue-500 mr-2">💬</span>
              <span className="text-gray-700">{t("side.meta1")}</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-500 mr-2">💬</span>
              <span className="text-gray-700">{t("side.meta2")}</span>
            </li>
            <li className="flex items-start">
              <span className="text-gray-400 mr-2">📋</span>
              <span className="text-gray-700">{t("side.meta3")}</span>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-gray-800 mb-3 text-sm lg:text-base">{t("side.customFilters")}</h3>
          <Button variant="outline" size="sm" className="text-blue-600 border-blue-600 hover:bg-blue-50 bg-transparent text-xs lg:text-sm">
            {t("side.createFilter")}
          </Button>
        </div>

        <div>
          <h3 className="font-semibold text-gray-800 mb-3 text-sm lg:text-base">{t("side.watchedTags")}</h3>
          <div className="flex items-center justify-center py-6 lg:py-8">
            <div className="text-center">
              <Eye className="w-10 h-10 lg:w-12 lg:h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-xs lg:text-sm text-gray-500 mb-3">{t("side.watchText")}</p>
              <Button variant="outline" size="sm" className="text-blue-600 border-blue-600 hover:bg-blue-50 bg-transparent text-xs lg:text-sm">
                👁️ {t("side.watchTag")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default RightSideBar;
