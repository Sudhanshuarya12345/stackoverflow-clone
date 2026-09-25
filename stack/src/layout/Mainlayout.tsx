import Navbar from "@/components/Navbar";
import RightSideBar from "@/components/RightSideBar";
import Sidebar from "@/components/Sidebar";
import { useRouter } from "next/router";
import React, { ReactNode, useEffect, useState } from "react";
interface MainlayoutProps {
  children: ReactNode;
}
const Mainlayout = ({ children }: MainlayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  // Close the mobile drawer whenever the user navigates.
  useEffect(() => {
    setSidebarOpen(false);
  }, [router.asPath]);

  return (
    <div className="bg-[#f8f9fa] text-[#3a3a3a] min-h-screen">
      <Navbar handleslidein={() => setSidebarOpen((state) => !state)} />
      <div className="flex max-w-full py-1">
        <Sidebar isopen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6 bg-white">{children}</main>
        <div className="hidden xl:block border-l border-gray-200">
          <RightSideBar />
        </div>
      </div>
    </div>
  );
};

export default Mainlayout;
