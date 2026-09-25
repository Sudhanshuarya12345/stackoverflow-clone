import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitting?: boolean;
  onSubmit: (code: string) => Promise<void> | void;
  onResend?: () => Promise<void> | void;
};

export default function OtpDialog({ open, onOpenChange, title, description, submitting, onSubmit, onResend }: Props) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  useEffect(() => {
    if (open) setCode("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-white text-gray-900">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) onSubmit(code);
          }}
        >
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
          <Button type="submit" disabled={code.length !== 6 || submitting} className="w-full bg-blue-600 text-white hover:bg-blue-700">
            {submitting ? t("otp.verifying") : t("otp.verify")}
          </Button>
          {onResend && (
            <button type="button" onClick={() => onResend()} className="w-full text-center text-sm text-blue-600 hover:underline">
              {t("otp.resend")}
            </button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
