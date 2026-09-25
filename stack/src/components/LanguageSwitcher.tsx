import OtpDialog from "@/components/OtpDialog";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useI18n } from "@/lib/i18n";
import { LanguageCode, LANGUAGES } from "@/locales";
import { Check, Globe } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

type Challenge = { challengeId: string; channel: "email" | "sms"; destination: string; language: LanguageCode };

// Switching language requires an OTP: French is verified by email, every other language by SMS.
export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { user, updateLocalUser } = useAuth();
  const { language, t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<LanguageCode | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [verifying, setVerifying] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const choose = async (code: LanguageCode) => {
    setOpen(false);
    if (code === language) return;
    if (!user) {
      toast.info(t("language.loginRequired"));
      router.push("/auth");
      return;
    }
    setPending(code);
    try {
      const res = await axiosInstance.post("/user/language/request", { language: code });
      if (!res.data.otpRequired) {
        updateLocalUser({ language: res.data.language });
        return;
      }
      setChallenge({ ...res.data, language: code });
    } catch (error: any) {
      if (error.response?.data?.code === "PHONE_REQUIRED") {
        toast.warn(t("language.phoneRequired"));
        router.push(`/users/${user._id}?edit=phone`);
      } else if (error.response?.data?.code === "SMS_FAILED") {
        toast.error(t("language.smsFailed"));
      } else {
        toast.error(error.response?.data?.message || t("common.error"));
      }
    } finally {
      setPending(null);
    }
  };

  const verify = async (code: string) => {
    if (!challenge) return;
    setVerifying(true);
    try {
      const res = await axiosInstance.post("/user/language/verify", { challengeId: challenge.challengeId, code });
      updateLocalUser({ language: res.data.language });
      const name = LANGUAGES.find((l) => l.code === res.data.language)?.nativeName;
      setChallenge(null);
      toast.success(t("language.changed", { language: name }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("auth.otpInvalid"));
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (!challenge) return;
    try {
      await axiosInstance.post("/user/language/resend", { challengeId: challenge.challengeId });
      toast.success(t("auth.otpResent"));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t("common.error"));
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language.choose")}
      >
        <Globe className="h-4 w-4" />
        {!compact && <span className="hidden sm:inline">{current.nativeName}</span>}
      </button>
      {open && (
        <ul role="listbox" className="absolute right-0 z-50 mt-1 w-56 rounded-md border bg-white py-1 shadow-lg">
          <li className="px-3 py-1.5 text-xs text-gray-500">{t("language.verifyNote")}</li>
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === language}
                disabled={pending !== null}
                onClick={() => choose(l.code)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-50"
              >
                <span>
                  {l.nativeName} <span className="text-xs text-gray-500">({l.englishName})</span>
                </span>
                {l.code === language && <Check className="h-4 w-4 text-green-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <OtpDialog
        open={Boolean(challenge)}
        onOpenChange={(v) => !v && setChallenge(null)}
        title={t("language.verifyTitle")}
        description={
          challenge
            ? t(challenge.channel === "email" ? "language.otpSentEmail" : "language.otpSentSms", {
                destination: challenge.destination,
                language: LANGUAGES.find((l) => l.code === challenge.language)?.nativeName,
              })
            : ""
        }
        submitting={verifying}
        onSubmit={verify}
        onResend={resend}
      />
    </div>
  );
}
