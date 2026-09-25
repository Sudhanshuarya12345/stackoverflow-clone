import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { LogOut, Menu, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import LanguageSwitcher from "./LanguageSwitcher";
import NotificationBell from "./NotificationBell";

const Navbar = ({ handleslidein }: any) => {
  const { user, Logout } = useAuth();
  const { t } = useI18n();
  const [hasMounted, setHasMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();
  useEffect(() => {
    setHasMounted(true);
  }, []);
  const handlelogout = async () => {
    await Logout();
    router.push("/");
  };
  return (
    <div className="sticky top-0 z-20 w-full min-h-[53px] bg-white border-t-[3px] border-[#ef8236] shadow-[0_1px_5px_#00000033] flex items-center justify-center">
      <div className="w-full max-w-[1440px] px-2 sm:px-4 flex items-center justify-between gap-2 mx-auto py-1">
        <button
          aria-label={t("nav.toggleMenu")}
          className="md:hidden p-2 rounded hover:bg-gray-100 transition"
          onClick={handleslidein}
        >
          <Menu className="w-5 h-5 text-gray-800" />
        </button>
        <div className="flex min-w-0 items-center gap-2 flex-grow">
          <Link href="/" className="shrink-0 px-1 sm:px-3 py-1">
            <img src="/logo.png" alt="Logo" className="h-6 w-auto" />
          </Link>

          <div className="hidden lg:flex gap-1">
            {(["nav.about", "nav.products", "nav.forTeams"] as const).map((item) => (
              <Link key={item} href="/" className="whitespace-nowrap text-sm text-[#454545] font-medium px-3 py-2 rounded hover:bg-gray-200 transition">
                {t(item)}
              </Link>
            ))}
            <Link href="/feed" className="text-sm text-[#454545] font-medium px-3 py-2 rounded hover:bg-gray-200 transition">
              {t("nav.feed")}
            </Link>
            <Link href="/subscription" className="text-sm text-[#454545] font-medium px-3 py-2 rounded hover:bg-gray-200 transition">
              {t("nav.premium")}
            </Link>
          </div>
          <form
            className="hidden md:block flex-grow relative px-3"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/?q=${encodeURIComponent(searchTerm.trim())}`);
              setSearchTerm("");
            }}
          >
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("nav.search")}
              className="w-full max-w-[600px] pl-9 pr-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <Search className="absolute left-6 top-2.5 h-4 w-4 text-gray-600" />
          </form>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageSwitcher />
          {!hasMounted ? null : !user ? (
            <>
              <Link
                href="/auth"
                className="whitespace-nowrap text-xs sm:text-sm font-medium text-[#454545] bg-[#e7f8fe] hover:bg-[#d3e4eb] border border-blue-500 px-2 sm:px-4 py-1.5 rounded transition"
              >
                {t("nav.login")}
              </Link>
              <Link
                href="/signup"
                className="whitespace-nowrap text-xs sm:text-sm font-medium text-white bg-[#0a95ff] hover:bg-[#0074cc] border border-transparent px-2 sm:px-4 py-1.5 rounded transition shadow-sm"
              >
                {t("nav.signup")}
              </Link>
            </>
          ) : (
            <>
              <NotificationBell enabled={Boolean(user)} />
              <div className="flex items-center">
                <Link
                  href={`/users/${user._id}`}
                  className="flex items-center justify-center bg-orange-600 text-white text-sm font-semibold w-9 h-9 rounded-full"
                  aria-label={t("nav.profile")}
                >
                  {user.name?.charAt(0).toUpperCase()}
                </Link>
                {user.plan && user.plan !== "free" && (
                  <span className="hidden sm:inline-block ml-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider shadow-sm ${user.plan === 'gold' ? 'bg-[#ffd700] text-gray-900' : user.plan === 'silver' ? 'bg-[#c0c0c0] text-gray-900' : 'bg-[#cd7f32] text-white'}`}>{t(`plan.${user.plan}` as any)}</span>
                  </span>
                )}
              </div>

              <button
                onClick={handlelogout}
                aria-label={t("nav.logout")}
                className="flex items-center gap-1 text-sm font-medium text-[#454545] bg-[#e7f8fe] hover:bg-[#d3e4eb] border border-blue-500 px-2 sm:px-4 py-1.5 rounded transition"
              >
                <LogOut className="h-4 w-4 sm:hidden" />
                <span className="hidden sm:inline">{t("nav.logout")}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Navbar;
