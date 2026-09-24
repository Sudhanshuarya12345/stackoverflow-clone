import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";
import { toast } from "react-toastify";

export default function ForgotPasswordPage() {
  const { forgotPassword, loading } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const handlesubmit = async (e: any) => {
    e.preventDefault();
    if (!identifier) {
      toast.error("Please enter your registered email or phone number");
      return;
    }
    try {
      await forgotPassword(identifier);
    } catch (error) {
      console.log(error);
    }
  };
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 lg:mb-8">
          <Link href="/" className="flex items-center justify-center mb-4">
            <div className="w-6 h-6 lg:w-8 lg:h-8 bg-orange-500 rounded mr-2 flex items-center justify-center">
              <div className="w-4 h-4 lg:w-6 lg:h-6 bg-white rounded-sm flex items-center justify-center">
                <div className="w-3 h-3 lg:w-4 lg:h-4 bg-orange-500 rounded-sm"></div>
              </div>
            </div>
            <span className="text-lg lg:text-xl font-bold text-gray-800">
              stack<span className="font-normal">overflow</span>
            </span>
          </Link>
        </div>
        <form onSubmit={handlesubmit}>
          <Card>
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-xl lg:text-2xl">
                Forgot your password?
              </CardTitle>
              <CardDescription>
                Enter your registered email or phone number and we&apos;ll send
                you a new password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-sm">
                  Email or phone number
                </Label>
                <Input
                  id="identifier"
                  placeholder="m@example.com or +91 98765 43210"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                <p className="text-xs text-gray-600">
                  You can use this option only once per day.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-sm"
              >
                {loading ? "Sending.." : "Reset password"}
              </Button>
              <div className="text-center text-sm">
                Remembered it?{" "}
                <Link href="/auth" className="text-blue-600 hover:underline">
                  Log in
                </Link>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
