import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import Mainlayout from "@/layout/Mainlayout";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import PlanBadge from "@/components/PlanBadge";
import { Calendar, Crown, Search, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from "react";
const UsersPage = () => {
  const { t } = useI18n();
  const [users, setusers] = useState<any>(null);
  const [loading, setloading] = useState(true);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const fetchuser = async () => {
      try {
        const res = await axiosInstance.get("/user/getalluser");
        setusers(res.data.data);
      } catch (error) {
        console.log(error);
      } finally {
        setloading(false);
      }
    };
    fetchuser();
  }, []);
  if (loading) {
    return (
      <Mainlayout>
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </Mainlayout>
    );
  }
  if (!users || users.length === 0) {
    return (
      <Mainlayout>
        <div className="text-center text-gray-500 mt-4">{t("users.none")}</div>
      </Mainlayout>
    );
  }
  const filteredUsers = users.filter((u: any) =>
    u.name?.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <Mainlayout>
      <div className="max-w-6xl">
        <h1 className="text-xl lg:text-2xl font-semibold mb-6">{t("nav.users")}</h1>

        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder={t("users.filter")}
              className="pl-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredUsers.map((user: any) => {
            const isGold = user.plan === "gold";
            const isSilver = user.plan === "silver";
            const isBronze = user.plan === "bronze";
            return (
              <Link key={user._id} href={`/users/${user._id}`}>
                <div
                  className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${isGold
                    ? "border-2 border-amber-400 bg-amber-50"
                    : isSilver
                      ? "border-2 border-gray-400 bg-gray-50"
                      : isBronze
                        ? "border border-[#cd7f32]/60"
                        : "border-gray-200"
                    }`}
                >
                  {isGold && (
                    <div className="flex items-center mb-2 text-amber-600 text-xs font-semibold">
                      <Crown className="w-3.5 h-3.5 mr-1" /> {t("profile.featured")}
                    </div>
                  )}
                  {isSilver && (
                    <div className="flex items-center mb-2 text-gray-500 text-xs font-semibold">
                      <Sparkles className="w-3.5 h-3.5 mr-1" /> {t("profile.enhanced")}
                    </div>
                  )}
                  <div className="flex items-center mb-3">
                    <Avatar className="w-12 h-12 mr-3">
                      <AvatarFallback className="text-lg">
                        {user.name
                          .split(" ")
                          .map((n: any) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-blue-600 hover:text-blue-800 truncate">
                        {user.name}
                      </h3>
                      <p className="flex items-center text-sm text-gray-600">
                        <Star className="w-3.5 h-3.5 mr-1 text-yellow-500" /> {user.reputation ?? 0}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center text-sm text-gray-600 mb-3">
                    <Calendar className="w-4 h-4 mr-1" />
                    <span>{t("users.joined", { year: new Date(user.joinDate).getFullYear() })}</span>
                  </div>
                  <PlanBadge plan={user.plan} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </Mainlayout>
  );
};

export default UsersPage;
