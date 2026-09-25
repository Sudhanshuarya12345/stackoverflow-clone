import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthShell from "@/components/auth/AuthShell";
import SocialButtons from "@/components/auth/SocialButtons";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState } from "react";
import { toast } from "react-toastify";

type Challenge = { challengeId: string; destination: string };

const LoginPage = () => {
  const router = useRouter();
  const { t } = useI18n();
  const { Login, verifyLoginOtp, resendLoginOtp, loading } = useAuth();
  const [form, setform] = useState({ email: "", password: "" });
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setform({ ...form, [e.target.id]: e.target.value });
  };
  const handlesubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error(t("auth.allFieldsRequired"));
      return;
    }
    try {
      const result = await Login(form);
      if (result?.otpRequired) {
        setChallenge({ challengeId: result.challengeId, destination: result.destination });
        setCode("");
        return;
      }
      router.push("/");
    } catch (error) {
      console.log(error);
    }
  };
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge || code.length !== 6) return;
    try {
      await verifyLoginOtp({ challengeId: challenge.challengeId, code, rememberDevice });
      router.push("/");
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <AuthShell>
      {challenge ? (
        <form onSubmit={handleVerify}>
          <Card>
            <CardHeader className="space-y-1 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-green-600" />
              <CardTitle className="text-xl lg:text-2xl">{t("auth.verifyDeviceTitle")}</CardTitle>
              <CardDescription>{t("auth.verifyDeviceText", { destination: challenge.destination })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="text-center text-2xl tracking-[0.5em]"
                aria-label={t("otp.codeLabel")}
              />
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                />
                <span>{t("auth.rememberDevice")}</span>
              </label>
              <Button type="submit" disabled={code.length !== 6 || loading} className="w-full bg-blue-600 hover:bg-blue-700 text-sm">
                {loading ? t("otp.verifying") : t("otp.verify")}
              </Button>
              <div className="flex justify-between text-sm">
                <button type="button" onClick={() => resendLoginOtp(challenge.challengeId)} className="text-blue-600 hover:underline">
                  {t("otp.resend")}
                </button>
                <button type="button" onClick={() => setChallenge(null)} className="text-gray-600 hover:underline">
                  {t("common.back")}
                </button>
              </div>
            </CardContent>
          </Card>
        </form>
      ) : (
        <form onSubmit={handlesubmit}>
          <Card>
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-xl lg:text-2xl">{t("auth.loginTitle")}</CardTitle>
              <CardDescription>{t("auth.loginSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SocialButtons mode="login" />
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">
                  {t("auth.emailOrPhone")}
                </Label>
                <Input id="email" placeholder="m@example.com" onChange={handleChange} value={form.email} autoComplete="username" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm">
                  {t("auth.password")}
                </Label>
                <Input id="password" type="password" onChange={handleChange} value={form.password} autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-sm">
                {loading ? t("common.loading") : t("nav.login")}
              </Button>
              <p className="text-xs text-gray-500 text-center">{t("auth.newDeviceNote")}</p>
              <div className="text-center text-sm">
                <Link href="/forgot-password" className="text-blue-600 hover:underline">
                  {t("auth.forgotLink")}
                </Link>
              </div>
              <div className="text-center text-sm">
                {t("auth.noAccount")}{" "}
                <Link href="/signup" className="text-blue-600 hover:underline">
                  {t("nav.signup")}
                </Link>
              </div>
            </CardContent>
          </Card>
        </form>
      )}
    </AuthShell>
  );
};

export default LoginPage;
