import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AuthShell from "@/components/auth/AuthShell";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import { AlertTriangle, Copy, KeyRound, MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";

type Challenge = { challengeId: string; destination: string };

export default function ForgotPasswordPage() {
  const { forgotPassword, loading } = useAuth();
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [warning, setWarning] = useState("");
  const [sent, setSent] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const handlesubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWarning("");
    setSent("");
    if (!identifier.trim()) {
      toast.error(t("forgot.required"));
      return;
    }
    try {
      const res = await forgotPassword(identifier.trim());
      if (res.otpRequired) {
        setChallenge({ challengeId: res.challengeId, destination: res.destination });
        setCode("");
      } else {
        setSent(res.message);
      }
    } catch (error: any) {
      if (error.response?.status === 429) setWarning(t("forgot.oncePerDay"));
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge || code.length !== 6) return;
    setVerifying(true);
    try {
      const res = await axiosInstance.post("/user/forgot-password/verify", { challengeId: challenge.challengeId, code });
      setNewPassword(res.data.password);
      setChallenge(null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("auth.otpInvalid"));
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (!challenge) return;
    try {
      await axiosInstance.post("/user/forgot-password/resend", { challengeId: challenge.challengeId });
      toast.success(t("auth.otpResent"));
    } catch (error: any) {
      toast.error(error.response?.data?.code === "SMS_FAILED" ? t("language.smsFailed") : error.response?.data?.message || t("common.error"));
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(newPassword);
      toast.success(t("forgot.copied"));
    } catch {
      // Clipboard may be blocked; the password is still visible to copy manually.
    }
  };

  if (newPassword) {
    return (
      <AuthShell>
        <Card>
          <CardHeader className="space-y-1 text-center">
            <KeyRound className="mx-auto h-10 w-10 text-green-600" />
            <CardTitle className="text-xl lg:text-2xl">{t("forgot.newPasswordTitle")}</CardTitle>
            <CardDescription>{t("forgot.newPasswordText")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 rounded border bg-gray-50 p-3">
              <code className="flex-1 break-all text-center text-xl font-semibold tracking-wider">{newPassword}</code>
              <Button type="button" variant="outline" size="sm" onClick={copyPassword} aria-label={t("forgot.copy")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Link href="/auth" className="block w-full rounded bg-blue-600 py-2 text-center text-sm font-medium text-white hover:bg-blue-700">
              {t("forgot.goLogin")}
            </Link>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  if (challenge) {
    return (
      <AuthShell>
        <form onSubmit={verifyCode}>
          <Card>
            <CardHeader className="space-y-1 text-center">
              <MessageSquare className="mx-auto h-10 w-10 text-blue-600" />
              <CardTitle className="text-xl lg:text-2xl">{t("forgot.codeTitle")}</CardTitle>
              <CardDescription>{t("forgot.codeSent", { destination: challenge.destination })}</CardDescription>
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
              <Button type="submit" disabled={code.length !== 6 || verifying} className="w-full bg-blue-600 hover:bg-blue-700 text-sm">
                {verifying ? t("otp.verifying") : t("forgot.submit")}
              </Button>
              <div className="flex justify-between text-sm">
                <button type="button" onClick={resend} className="text-blue-600 hover:underline">
                  {t("otp.resend")}
                </button>
                <button type="button" onClick={() => setChallenge(null)} className="text-gray-600 hover:underline">
                  {t("common.back")}
                </button>
              </div>
            </CardContent>
          </Card>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={handlesubmit}>
        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl lg:text-2xl">{t("forgot.title")}</CardTitle>
            <CardDescription>{t("forgot.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {warning && (
              <div role="alert" className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{warning}</span>
              </div>
            )}
            {sent && <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{sent}</div>}
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-sm">
                {t("forgot.identifierLabel")}
              </Label>
              <Input
                id="identifier"
                placeholder="m@example.com / +91 98765 43210"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              <p className="text-xs text-gray-600">{t("forgot.limitNote")}</p>
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-sm">
              {loading ? t("forgot.sending") : t("forgot.submit")}
            </Button>
            <div className="text-center text-sm">
              {t("forgot.remembered")}{" "}
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
