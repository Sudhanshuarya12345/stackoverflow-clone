import Link from "next/link";
import { ReactNode } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// Shared frame for the logged-out pages (login, signup, forgot password).
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 lg:mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <div className="w-6 h-6 lg:w-8 lg:h-8 bg-orange-500 rounded mr-2 flex items-center justify-center">
              <div className="w-4 h-4 lg:w-6 lg:h-6 bg-white rounded-sm flex items-center justify-center">
                <div className="w-3 h-3 lg:w-4 lg:h-4 bg-orange-500 rounded-sm"></div>
              </div>
            </div>
            <span className="text-lg lg:text-xl font-bold text-gray-800">
              stack<span className="font-normal">overflow</span>
            </span>
          </Link>
          <LanguageSwitcher />
        </div>
        {children}
      </div>
    </div>
  );
}
