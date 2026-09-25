import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PlanBadge from "@/components/PlanBadge";
import { PrivilegesCard, ReputationHistory, TransferButton, TransferHistory } from "@/components/reputation/ReputationPanel";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import { Calendar, CreditCard, Edit, Plus, Settings, Star, X } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

const ProfilePage = () => {
  const { user, updateLocalUser, authReady } = useAuth();
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [profile, setProfile] = useState<any>(null);
  const [loading, setloading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", about: "", phone: "", tags: [] as string[] });
  const [newTag, setNewTag] = useState("");
  const [showBadges, setShowBadges] = useState(false);
  const [badgeFilter, setBadgeFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    try {
      const res = await axiosInstance.get(`/user/profile/${id}`);
      setProfile(res.data.data);
    } catch (error) {
      console.log(error);
      setProfile(null);
    } finally {
      setloading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authReady) loadProfile();
  }, [authReady, loadProfile, refreshKey]);

  const isOwnProfile = Boolean(user?._id && id === user._id);

  const openEditor = useCallback(() => {
    if (!profile) return;
    setEditForm({ name: profile.name || "", about: profile.about || "", phone: profile.phone || "", tags: profile.tags || [] });
    setIsEditing(true);
  }, [profile]);

  useEffect(() => {
    if (isOwnProfile && profile && router.query.edit) openEditor();
  }, [isOwnProfile, Boolean(profile), router.query.edit]);

  if (loading) {
    return (
      <Mainlayout>
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </Mainlayout>
    );
  }
  if (!profile) {
    return (
      <Mainlayout>
        <div className="text-center text-gray-500 mt-4">{t("profile.notFound")}</div>
      </Mainlayout>
    );
  }

  const handleSaveProfile = async () => {
    try {
      const res = await axiosInstance.patch(`/user/update/${user?._id}`, { editForm });
      setProfile(res.data.data);
      updateLocalUser({
        name: res.data.data.name,
        about: res.data.data.about,
        tags: res.data.data.tags,
        phone: res.data.data.phone,
        reputation: res.data.data.reputation,
      });
      setIsEditing(false);
      if (router.query.edit) router.replace(`/users/${id}`, undefined, { shallow: true });
      toast.success(t("profile.updated"));
      if (res.data.bonusAwarded) {
        toast.success(t("profile.bonusAwarded"));
        setRefreshKey((k) => k + 1);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  const handleAddTag = () => {
    const trimmedTag = newTag.trim();
    if (trimmedTag && !editForm.tags.includes(trimmedTag)) {
      setEditForm({ ...editForm, tags: [...editForm.tags, trimmedTag] });
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditForm({ ...editForm, tags: editForm.tags.filter((tag) => tag !== tagToRemove) });
  };

  const earnedBadges: any[] = profile.earnedBadges || [];
  const goldCount = earnedBadges.filter((b) => b.tier === "gold").length;
  const silverCount = earnedBadges.filter((b) => b.tier === "silver").length;
  const bronzeCount = earnedBadges.filter((b) => b.tier === "bronze").length;
  const filteredBadges = badgeFilter === "all" ? earnedBadges : earnedBadges.filter((b) => b.tier === badgeFilter);
  const tierColor: Record<string, string> = { gold: "bg-yellow-500", silver: "bg-gray-400", bronze: "bg-amber-600" };
  const reputation = profile.reputation ?? 0;

  return (
    <Mainlayout>
      <Head>
        <title>{profile.name}</title>
      </Head>
      <div className="max-w-6xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 mb-8">
          <Avatar className="w-20 h-20 sm:w-24 sm:h-24 lg:w-32 lg:h-32">
            <AvatarFallback className="text-2xl lg:text-3xl">
              {profile.name
                .split(" ")
                .map((n: string) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="break-words text-2xl lg:text-3xl font-bold text-gray-800">{profile.name}</h1>
                  <PlanBadge plan={profile.plan} />
                </div>
                {profile.plan === "gold" && <p className="text-sm text-amber-600 font-semibold mb-1">✨ {t("profile.featured")}</p>}
                {profile.plan === "silver" && <p className="text-sm text-gray-500 font-semibold mb-1">✨ {t("profile.enhanced")}</p>}
              </div>

              <div className="flex flex-wrap gap-2">
                {isOwnProfile && (
                  <>
                    <Button variant="outline" className="flex items-center gap-2 bg-transparent" onClick={openEditor}>
                      <Edit className="w-4 h-4" />
                      {t("profile.edit")}
                    </Button>
                    <Link href="/settings" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-gray-50">
                      <Settings className="h-4 w-4" /> {t("nav.settings")}
                    </Link>
                  </>
                )}
                {user && !isOwnProfile && (
                  <TransferButton receiver={{ _id: profile._id, name: profile.name }} onTransferred={() => setRefreshKey((k) => k + 1)} />
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-4">
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                {t("profile.memberSince")} {formatDate(profile.joinDate)}
              </div>
              <a href="#reputation" className="flex items-center hover:underline">
                <Star className="w-4 h-4 mr-1 text-yellow-500" />
                {t("profile.reputation")} <span className="font-semibold text-gray-800 ml-1">{reputation}</span>
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
                <span className="font-semibold">{goldCount}</span>
                <span className="text-gray-600 ml-1">{t("profile.goldBadges")}</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-gray-400 rounded-full mr-2"></div>
                <span className="font-semibold">{silverCount}</span>
                <span className="text-gray-600 ml-1">{t("profile.silverBadges")}</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-amber-600 rounded-full mr-2"></div>
                <span className="font-semibold">{bronzeCount}</span>
                <span className="text-gray-600 ml-1">{t("profile.bronzeBadges")}</span>
              </div>
              <button
                onClick={() => setShowBadges((current) => !current)}
                className="px-3 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded text-xs"
              >
                {showBadges ? t("common.close") : t("profile.details")}
              </button>
            </div>
            {showBadges && (
              <Card className="mt-4">
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold">{t("profile.badges")}</CardTitle>
                  <div className="flex items-center gap-1">
                    {["all", "gold", "silver", "bronze"].map((tier) => (
                      <button
                        key={tier}
                        onClick={() => setBadgeFilter(tier)}
                        className={`px-2 py-0.5 rounded text-xs ${badgeFilter === tier ? "bg-gray-200 text-gray-800" : "text-gray-600 hover:bg-gray-100"}`}
                      >
                        {t(`badgeFilter.${tier}` as any)}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredBadges.length === 0 ? (
                    <p className="text-sm text-gray-500">{t("profile.noBadges")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {filteredBadges.map((badge) => (
                        <li key={badge.key} className="flex items-center justify-between text-sm">
                          <div className="flex items-center">
                            <div className={`w-3 h-3 rounded-full mr-2 ${tierColor[badge.tier] || "bg-gray-300"}`}></div>
                            <span className="font-medium capitalize">{badge.name}</span>
                          </div>
                          <span className="text-xs text-gray-500">{formatDate(badge.awardedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {isOwnProfile && !profile.profileBonusAwarded && (
          <div className="mb-6 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            {t("profile.completeHint")}{" "}
            <button type="button" onClick={openEditor} className="font-semibold text-blue-700 hover:underline">
              {t("profile.completeNow")}
            </button>
          </div>
        )}

        {isOwnProfile && (
          <div className="mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-orange-600" /> {t("profile.subscriptionTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="text-sm text-gray-700">
                    <p>
                      {t("profile.currentPlan")} <span className="font-semibold uppercase">{t(`plan.${profile.plan || "free"}` as any)}</span>
                    </p>
                    <p className="mt-1 text-gray-500">{t("profile.subscriptionText")}</p>
                  </div>
                  <Link
                    href="/subscription/dashboard"
                    className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                  >
                    {t("profile.manageSubscription")}
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            <Card>
              <CardHeader>
                <CardTitle>{t("profile.about")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed whitespace-pre-line break-words">
                  {profile.about || <span className="text-gray-400">{t("profile.noAbout")}</span>}
                </p>
              </CardContent>
            </Card>
            <ReputationHistory userId={profile._id} refreshKey={refreshKey} />
            {isOwnProfile && <TransferHistory refreshKey={refreshKey} />}
          </div>
          <div className="space-y-6 min-w-0">
            <PrivilegesCard reputation={reputation} />
            <Card>
              <CardHeader>
                <CardTitle>{t("profile.topTags")}</CardTitle>
              </CardHeader>
              <CardContent>
                {(profile.tags || []).length === 0 ? (
                  <p className="text-sm text-gray-400">{t("profile.noTags")}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {profile.tags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="bg-blue-100 text-blue-800">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>{t("profile.edit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <p className="text-xs text-gray-500">{t("profile.mandatoryNote")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">{t("auth.displayName")} *</Label>
                <Input id="name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="phone">{t("profile.mobile")} *</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoFocus={router.query.edit === "phone"}
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
                <p className="mt-1 text-xs text-gray-500">{t("profile.mobileHelp")}</p>
              </div>
            </div>
            <div>
              <Label htmlFor="about">{t("profile.aboutMe")} *</Label>
              <Textarea
                id="about"
                value={editForm.about}
                onChange={(e) => setEditForm({ ...editForm, about: e.target.value })}
                placeholder={t("profile.aboutPlaceholder")}
                className="min-h-32"
              />
            </div>
            <div className="space-y-3">
              <Label>{t("profile.skills")} *</Label>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder={t("profile.addSkill")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                />
                <Button onClick={handleAddTag} variant="outline" size="sm" className="bg-orange-600 text-white" aria-label={t("profile.addSkill")}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {editForm.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="bg-orange-100 text-orange-800 flex items-center gap-1">
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)} className="ml-1 hover:text-red-600" aria-label={t("common.remove")}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsEditing(false)} className="bg-white text-gray-800 hover:text-gray-900">
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSaveProfile} className="bg-blue-600 hover:bg-blue-700">
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Mainlayout>
  );
};

export default ProfilePage;
