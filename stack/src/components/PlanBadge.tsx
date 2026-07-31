import React from "react";
import { Badge } from "./ui/badge";

interface PlanBadgeProps {
    plan: string;
}

const PlanBadge = ({ plan }: PlanBadgeProps) => {
    if (!plan || plan === "free") return null;

    const planColors: Record<string, string> = {
        bronze: "bg-[#cd7f32] text-white hover:bg-[#b06a26]",
        silver: "bg-[#c0c0c0] text-gray-900 hover:bg-[#a6a6a6]",
        gold: "bg-[#ffd700] text-gray-900 hover:bg-[#e0bd00]",
    };

    return (
        <Badge className={`${planColors[plan]} border-none ml-2 uppercase text-xs tracking-wider shadow-sm font-semibold px-2 py-0.5`}>
            {plan}
        </Badge>
    );
};

export default PlanBadge;
