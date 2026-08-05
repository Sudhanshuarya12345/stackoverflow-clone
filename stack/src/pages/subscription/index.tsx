import Head from "next/head";
import Script from "next/script";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useState } from "react";
import { toast } from "react-toastify";
import { Check, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

const PLANS = [
    {
        id: "free",
        name: "Free",
        price: "₹0",
        period: "forever",
        description: "Basic features for occasional users.",
        features: ["1 question/day", "Basic search only", "Standard profile visibility"],
        color: "bg-gray-200 border-gray-300 text-gray-800",
    },
    {
        id: "bronze",
        name: "Bronze",
        price: "₹99",
        period: "per month",
        description: "Great for active community participants.",
        features: ["5 questions/day", "Bronze profile badge", "Advanced search filters"],
        color: "bg-[#cd7f32]/20 border-[#cd7f32] text-[#8c5722]",
    },
    {
        id: "silver",
        name: "Silver",
        price: "₹299",
        period: "per month",
        description: "Enhanced visibility and priority support.",
        features: ["15 questions/day", "Silver profile badge", "Enhanced profile visibility", "Priority support flag", "Unlimited bookmarks"],
        color: "bg-[#c0c0c0]/20 border-[#999999] text-[#666666]",
    },
    {
        id: "gold",
        name: "Gold",
        price: "₹999",
        period: "per month",
        description: "The ultimate StackOverflow experience.",
        features: ["Unlimited questions", "Gold profile badge", "Highest search priority", "Featured profile visibility", "Priority support", "Exclusive community features"],
        color: "bg-[#ffd700]/20 border-[#e5c100] text-[#b29600]",
        popular: true,
    },
];

export default function PricingPage() {
    const { user, updateLocalUser } = useAuth();
    const [loadingPlan, setLoadingPlan] = useState("");
    const router = useRouter();

    const handleSubscribe = async (planId: string) => {
        if (!user) {
            toast.error("Please log in to subscribe");
            router.push("/auth");
            return;
        }
        if (planId === "free") return;

        setLoadingPlan(planId);
        try {
            const res = await axiosInstance.post("/api/subscriptions/create", { plan: planId });
            const { subscription_id, key_id } = res.data;

            const options = {
                key: key_id,
                subscription_id: subscription_id,
                name: "StackOverflow Clone",
                description: `${planId.toUpperCase()} Plan Subscription`,
                image: "/logo.png",
                handler: async function (response: any) {
                    toast.success("Payment successful! Verifying subscription...");
                    for (let attempt = 0; attempt < 6; attempt += 1) {
                        try {
                            const reconcile = await axiosInstance.post("/api/subscriptions/reconcile");
                            const syncedPlan = reconcile.data?.userPlanDetails?.plan;
                            if (syncedPlan && syncedPlan !== "free") {
                                updateLocalUser({ plan: syncedPlan });
                                router.push("/subscription/dashboard");
                                return;
                            }
                        } catch (error) {
                            // Retry briefly; Razorpay webhooks can arrive after checkout callback.
                        }
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                    }
                    toast.info("Payment received. Your plan will update when Razorpay confirmation arrives.");
                    router.push("/subscription/dashboard");
                },
                prefill: {
                    name: user.name,
                    email: user.email,
                },
                theme: {
                    color: "#f97316", // orange-500
                },
            };

            const rzp = new (window as any).Razorpay(options);
            rzp.on("payment.failed", function (response: any) {
                toast.error("Payment failed. Please try again.");
            });
            rzp.open();
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Failed to initiate subscription");
        } finally {
            setLoadingPlan("");
        }
    };

    return (
        <Mainlayout>
            <Head>
                <title>Premium Plans - StackOverflow</title>
            </Head>
            <Script src="https://checkout.razorpay.com/v1/checkout.js" />

            <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8 bg-white min-h-screen">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
                        Upgrade your StackOverflow experience
                    </h1>
                    <p className="mt-4 text-xl text-gray-500">
                        Choose a plan that fits your needs. Ask more questions, get better visibility, and stand out.
                    </p>

                    {user && (
                        <div className="mt-6 inline-flex flex-col items-center">
                            <Link href="/subscription/dashboard" className="text-orange-600 hover:text-orange-800 font-medium hover:underline">
                                View your active subscription &rarr;
                            </Link>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {PLANS.map((plan) => (
                        <div
                            key={plan.id}
                            className={`rounded-2xl shadow-xl flex flex-col relative ${plan.popular ? 'border-2 border-orange-500 transform scale-105 z-10' : 'border border-gray-200'
                                } ${plan.color.split(' ')[0]}`}
                        >
                            {plan.popular && (
                                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2">
                                    <span className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-orange-400 to-orange-600 px-3 py-1 text-xs font-bold font-medium text-white shadow-sm ring-1 ring-inset ring-orange-500/20 uppercase tracking-widest whitespace-nowrap">
                                        <Star className="w-3 h-3 mr-1 fill-white" /> Popular
                                    </span>
                                </div>
                            )}

                            <div className="p-8 pb-0">
                                <h3 className={`text-xl font-bold uppercase tracking-wider ${plan.color.split(' ')[2]}`}>
                                    {plan.name}
                                </h3>
                                <div className="mt-4 flex items-baseline text-5xl font-extrabold text-gray-900">
                                    {plan.price}
                                    <span className="ml-1 text-xl font-medium text-gray-500">/{plan.period.split(' ')[1] || 'mo'}</span>
                                </div>
                                <p className="mt-4 text-sm text-gray-600 font-medium">
                                    {plan.description}
                                </p>
                            </div>

                            <div className="flex flex-1 flex-col justify-between p-8 pt-6">
                                <ul role="list" className="space-y-4">
                                    {plan.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-start">
                                            <div className="flex-shrink-0">
                                                <Check className="h-5 w-5 text-green-500" aria-hidden="true" />
                                            </div>
                                            <p className="ml-3 text-sm text-gray-700 font-medium">{feature}</p>
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    disabled={loadingPlan === plan.id || plan.id === "free"}
                                    onClick={() => handleSubscribe(plan.id)}
                                    className={`mt-8 block w-full rounded-md px-6 py-3 text-center text-sm font-semibold shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 transition-all ${plan.id === "free"
                                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                        : plan.popular
                                            ? "bg-orange-600 text-white hover:bg-orange-500 focus-visible:outline-orange-600"
                                            : "bg-white text-orange-600 border border-orange-200 hover:bg-orange-50"
                                        }`}
                                >
                                    {loadingPlan === plan.id ? "Loading..." : plan.id === "free" ? "Current default" : `Subscribe to ${plan.name}`}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Mainlayout>
    );
}
