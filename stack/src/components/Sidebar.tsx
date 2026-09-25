import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/locales";
import {
  Activity,
  Bell,
  Bookmark,
  Bot,
  Building,
  Crown,
  FileText,
  Flame,
  Home,
  LifeBuoy,
  MessageSquare,
  MessageSquareIcon,
  Settings,
  ShieldAlert,
  Tag,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Badge } from "./ui/badge";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

// Items without an href are placeholders carried over from the original design (not wired up yet).
type NavItem = {
  href?: string;
  label: TranslationKey;
  icon: React.ElementType;
  iconClass?: string;
  badge?: { label: TranslationKey; className?: string };
};

const Sidebar = ({ isopen, onClose }: { isopen: boolean; onClose: () => void }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const items: NavItem[] = [
    { href: "/", label: "nav.home", icon: Home },
    { href: "/questions", label: "nav.questions", icon: MessageSquareIcon },
    { href: "/feed", label: "nav.feed", icon: Flame, iconClass: "text-orange-500" },
    { label: "nav.aiAssist", icon: Bot, badge: { label: "nav.labs" } },
    { href: "/tags", label: "nav.tags", icon: Tag },
    { href: "/users", label: "nav.users", icon: Users },
    { label: "nav.saves", icon: Bookmark },
    { label: "nav.challenges", icon: Trophy, badge: { label: "nav.new", className: "bg-orange-100 text-orange-800" } },
    { label: "nav.chat", icon: MessageSquare },
    { label: "nav.articles", icon: FileText },
    ...(user ? [{ href: "/notifications", label: "nav.notifications" as TranslationKey, icon: Bell }] : []),
    { href: "/support", label: "nav.support", icon: LifeBuoy },
    { href: "/community", label: "nav.goldCommunity", icon: Crown, iconClass: "text-amber-500" },
    { href: "/subscription", label: "nav.premium", icon: Trophy, iconClass: "text-orange-500" },
    { label: "nav.companies", icon: Building },
    ...(user ? [{ href: "/settings", label: "nav.settings" as TranslationKey, icon: Settings }] : []),
  ];
  const adminItems: NavItem[] =
    user?.role === "admin"
      ? [
          { href: "/admin/moderation", label: "nav.moderation", icon: ShieldAlert, iconClass: "text-red-500" },
          { href: "/admin/login-activity", label: "nav.loginActivity", icon: Activity, iconClass: "text-red-500" },
        ]
      : [];

  const isActive = (href: string) => (href === "/" ? router.pathname === "/" : router.pathname.startsWith(href));

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const content = (
      <>
        <Icon className={cn("w-4 h-4 mr-3 shrink-0", item.iconClass)} />
        {t(item.label)}
        {item.badge && (
          <Badge variant="secondary" className={cn("ml-auto text-xs", item.badge.className)}>
            {t(item.badge.label)}
          </Badge>
        )}
      </>
    );
    return (
      <li key={item.label}>
        {item.href ? (
          <Link
            href={item.href}
            className={cn(
              "flex items-center px-2 py-2 rounded text-sm",
              isActive(item.href) ? "bg-orange-50 font-semibold text-orange-800" : "text-gray-700 hover:bg-gray-100"
            )}
          >
            {content}
          </Link>
        ) : (
          <button type="button" className="flex w-full items-center px-2 py-2 text-left text-gray-700 hover:bg-gray-100 rounded text-sm">
            {content}
          </button>
        )}
      </li>
    );
  };

  return (
    <>
      {/* Backdrop for the mobile drawer */}
      <div
        className={cn("fixed inset-0 z-30 bg-black/40 md:hidden", isopen ? "block" : "hidden")}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto bg-white shadow-lg transition-transform duration-200 ease-in-out",
          "md:sticky md:top-0 md:z-auto md:h-auto md:min-h-screen md:w-48 md:translate-x-0 md:shadow-sm md:border-r lg:w-60",
          isopen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b p-3 md:hidden">
          <span className="font-semibold text-gray-800">{t("nav.menu")}</span>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded p-1 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-2 lg:p-4">
          <ul className="space-y-1">{items.map(renderItem)}</ul>
          {adminItems.length > 0 && (
            <>
              <p className="mt-4 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">{t("nav.admin")}</p>
              <ul className="mt-1 space-y-1">{adminItems.map(renderItem)}</ul>
            </>
          )}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
