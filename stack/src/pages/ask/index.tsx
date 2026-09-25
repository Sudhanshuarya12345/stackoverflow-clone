import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import axiosInstance from "@/lib/axiosinstance";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState } from "react";
import { toast } from "react-toastify";

const index = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    title: "",
    body: "",
    tags: [] as string[],
  });
  const [newTag, setNewTag] = useState("");
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    if (id === "tags") {
      const tagarray = value
        .split(/[s,]+/)
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      setFormData((prev) => ({ ...prev, tags: tagarray }));
    } else {
      setFormData((prev) => ({ ...prev, [id]: value }));
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error(t("ask.loginRequired"));
      router.push("/auth");
      return;
    }
    if (!formData.title.trim() || formData.body.trim().length < 20 || formData.tags.length === 0) {
      toast.error(t("ask.validation"));
      return;
    }
    try {
      const res = await axiosInstance.post("/question/ask", {
        postquestiondata: {
          questiontitle: formData.title,
          questionbody: formData.body,
          questiontags: formData.tags,
        },
      });
      if (res.data.data) {
        toast.success(t("ask.posted"));
        router.push("/");
      }
    } catch (error: any) {
      console.log(error);
      if (error.response?.status === 403) {
        toast.error(error.response.data.message || t("ask.limitReached"));
        router.push("/subscription");
      } else {
        toast.error(error.response?.data?.message || t("common.error"));
      }
    }
  };
  const handleAddTag = (e: any) => {
    e.preventDefault();
    const trimmedTag = newTag.trim();
    if (trimmedTag && !formData.tags.includes(trimmedTag) && formData.tags.length < 5) {
      setFormData({ ...formData, tags: [...formData.tags, trimmedTag] });
      setNewTag("");
    }
  };
  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((tag: any) => tag !== tagToRemove),
    });
  };
  return (
    <Mainlayout>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-xl lg:text-2xl font-semibold mb-6">
          {t("ask.title")}
        </h1>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg lg:text-xl">
                {t("ask.cardTitle")}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="title" className="text-base font-semibold">
                  {t("ask.titleLabel")}
                </Label>
                <p className="text-sm text-gray-600 mb-2">
                  {t("ask.titleHelp")}
                </p>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder={t("ask.titlePlaceholder")}
                  className="w-full"
                />
              </div>

              <div>
                <Label htmlFor="body" className="text-base font-semibold">
                  {t("ask.bodyLabel")}
                </Label>
                <p className="text-sm text-gray-600 mb-2">
                  {t("ask.bodyHelp")}
                </p>
                <Textarea
                  id="body"
                  value={formData.body}
                  onChange={handleChange}
                  placeholder={t("ask.bodyPlaceholder")}
                  className="min-h-32 lg:min-h-48 w-full"
                />
              </div>
              <div>
                <Label htmlFor="tags" className="text-base font-semibold">
                  {t("ask.tagsLabel")}
                </Label>
                <p className="text-sm text-gray-600 mb-2">
                  {t("ask.tagsHelp")}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag(e)}
                    placeholder={t("ask.tagsPlaceholder")}
                    className="w-full"
                  />
                  <Button
                    onClick={handleAddTag}
                    variant="outline"
                    size="sm"
                    type="button"
                    className="bg-orange-600 text-white"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag: any) => {
                    return (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="bg-orange-100 text-orange-800 flex items-center gap-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                <Button type="submit" className="bg-blue-600 text-white">
                  {t("ask.submit")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </Mainlayout>
  );
};

export default index;
