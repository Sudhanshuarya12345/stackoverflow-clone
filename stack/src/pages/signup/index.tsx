import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AuthShell from "@/components/auth/AuthShell";
import SocialButtons from "@/components/auth/SocialButtons";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";

export default function SignUpPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { Signup, loading } = useAuth();
  const [form, setform] = useState({ name: "", email: "", phone: "", password: "" });
  const [agreed, setAgreed] = useState(false);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setform({ ...form, [e.target.id]: e.target.value });
  };
  const handlesubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error(t("auth.allFieldsRequired"));
      return;
    }
    if (form.password.length < 8 || !/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password)) {
      toast.error(t("auth.passwordRule"));
      return;
    }
    if (!agreed) {
      toast.error(t("auth.mustAgree"));
      return;
    }
    try {
      await Signup(form);
      router.push("/");
    } catch (error) {
      console.log(error);
    }
  };
  return (
    <AuthShell>
      <form onSubmit={handlesubmit}>
        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl lg:text-2xl">{t("auth.signupTitle")}</CardTitle>
            <CardDescription>{t("auth.signupSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SocialButtons mode="signup" />
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm">
                {t("auth.displayName")}
              </Label>
              <Input id="name" placeholder={t("auth.displayNamePlaceholder")} value={form.name} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm">
                {t("auth.email")}
              </Label>
              <Input id="email" type="email" placeholder="m@example.com" value={form.email} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm">
                {t("auth.phoneOptional")}
              </Label>
              <Input id="phone" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={handleChange} />
              <p className="text-xs text-gray-600">{t("auth.phoneHelp")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm">
                {t("auth.password")}
              </Label>
              <Input id="password" type="password" value={form.password} onChange={handleChange} autoComplete="new-password" />
              <p className="text-xs text-gray-600">{t("auth.passwordRule")}</p>
            </div>
            <label className="flex items-start gap-2 text-sm leading-relaxed">
              <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>{t("auth.agreeTerms")}</span>
            </label>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-sm">
              {loading ? t("auth.signingUp") : t("nav.signup")}
            </Button>
            <div className="text-center text-sm">
              {t("auth.haveAccount")}{" "}
              <Link href="/auth" className="text-blue-600 hover:underline">
                {t("nav.login")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </AuthShell>
  );
}
