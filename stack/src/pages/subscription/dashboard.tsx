import Head from "next/head";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Link from "next/link";
import { FileDown, Calendar, CreditCard, Clock, CheckCircle, AlertCircle, Star, Save } from "lucide-react";
import PlanBadge from "@/components/PlanBadge";

export default function SubscriptionDashboard() {
    const { user, updateLocalUser } = useAuth();
    const [subData, setSubData] = useState<any>(null);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [billing, setBilling] = useState<any>({});
    const [savingBilling, setSavingBilling] = useState(false);

    useEffect(() => {
        if (user) {
            fetchDashboardData();
        }
    }, [user]);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const [subRes, invRes, billRes] = await Promise.all([
                axiosInstance.get("/api/subscriptions/me"),
                axiosInstance.get("/api/subscriptions/invoices?page=1&limit=20"),
                axiosInstance.get("/api/subscriptions/billing").catch(() => ({ data: { billingDetails: {} } }))
            ]);

            setSubData(subRes.data.subscription);
            setInvoices(invRes.data.invoices);
            setBilling(billRes.data.billingDetails || {});

            // Sync local user plan if it drifted
            if (subRes.data.userPlanDetails?.plan && subRes.data.userPlanDetails.plan !== user.plan) {
                updateLocalUser({ plan: subRes.data.userPlanDetails.plan });
            }
        } catch (error) {
            toast.error("Failed to load subscription details");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveBilling = async () => {
        setSavingBilling(true);
        try {
            const res = await axiosInstance.put("/api/subscriptions/billing", { billingDetails: billing });
            setBilling(res.data.billingDetails || billing);
            toast.success("Billing details saved");
        } catch (error) {
            toast.error("Failed to save billing details");
        } finally {
            setSavingBilling(false);
        }
    };

    const handleCancel = async () => {
        if (!window.confirm("Cancel subscription? Your premium access will continue until the paid period ends.")) return;
        try {
            await axiosInstance.post("/api/subscriptions/cancel");
            toast.success("Subscription cancellation scheduled for period end.");
            fetchDashboardData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Failed to cancel subscription");
        }
    };

    const handleDownloadInvoice = async (invoiceId: string, invoiceNumber: string) => {
        try {
            const res = await axiosInstance.get(`/api/subscriptions/invoices/${invoiceId}/download`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${invoiceNumber}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
        } catch (error) {
            toast.error("Failed to download invoice");
        }
    };

    if (!user) {
        return (
            <Mainlayout>
                <div className="flex justify-center p-12"><p>Please log in to view this page.</p></div>
            </Mainlayout>
        );
    }

    const isPremium = user.plan && user.plan !== "free";

    return (
        <Mainlayout>
            <Head>
                <title>Billing Dashboard - StackOverflow</title>
            </Head>

            <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
                <div className="md:flex md:items-center md:justify-between mb-8">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate flex items-center">
                            Billing & Subscriptions
                            <PlanBadge plan={user?.plan} />
                        </h2>
                    </div>
                    <div className="mt-4 flex md:mt-0 md:ml-4">
                        <Link
                            href="/subscription"
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
                        >
                            {isPremium ? "Manage Plan" : "Upgrade Plan"}
                        </Link>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-orange-500 rounded-full border-t-transparent"></div></div>
                ) : (
                    <div className="space-y-8">

                        {/* Current Plan Overview Card */}
                        <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                            <div className="px-4 py-5 sm:px-6 bg-gray-50 flex justify-between items-center">
                                <h3 className="text-lg leading-6 font-medium text-gray-900">Current Plan Overview</h3>
                                {subData?.status === 'active' && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        <CheckCircle className="w-4 h-4 mr-1" /> Active
                                    </span>
                                )}
                                {subData?.status === 'cancellation_pending' && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                        <AlertCircle className="w-4 h-4 mr-1" /> Cancels at period end
                                    </span>
                                )}
                                {['cancelled', 'expired', 'halted', 'completed'].includes(subData?.status) && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        <AlertCircle className="w-4 h-4 mr-1" /> {subData?.status}
                                    </span>
                                )}
                            </div>
                            <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                                <dl className="sm:divide-y sm:divide-gray-200">
                                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                        <dt className="text-sm font-medium text-gray-500 flex items-center"><Star className="w-4 h-4 mr-2" /> Plan Tier</dt>
                                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 uppercase font-bold">{user.plan}</dd>
                                    </div>
                                    {isPremium && subData && (
                                        <>
                                            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                                <dt className="text-sm font-medium text-gray-500 flex items-center"><Calendar className="w-4 h-4 mr-2" /> Started On</dt>
                                                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                                    {new Date(subData.current_period_start || subData.createdAt).toLocaleDateString()}
                                                </dd>
                                            </div>
                                            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                                <dt className="text-sm font-medium text-gray-500 flex items-center"><Clock className="w-4 h-4 mr-2" /> Renews / Expires On</dt>
                                                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                                    {subData.current_period_end ? new Date(subData.current_period_end).toLocaleDateString() : 'N/A'}
                                                </dd>
                                            </div>
                                            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                                <dt className="text-sm font-medium text-gray-500 flex items-center"><CreditCard className="w-4 h-4 mr-2" /> Subscription ID</dt>
                                                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-mono text-xs">
                                                    {subData.razorpay_subscription_id}
                                                </dd>
                                            </div>
                                            {subData.status === 'active' && (
                                                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                                                    <dt className="text-sm font-medium text-gray-500">Cancellation</dt>
                                                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                                        <button onClick={handleCancel} className="text-red-600 hover:text-red-800 font-medium">
                                                            Cancel at period end
                                                        </button>
                                                    </dd>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {!isPremium && (
                                        <div className="py-4 sm:py-5 px-6">
                                            <p className="text-sm text-gray-500">You are currently on the Free plan. Upgrade to unlock more questions, badges, and search perks.</p>
                                        </div>
                                    )}
                                </dl>
                            </div>
                        </div>

                        {/* Billing Details Card */}
                        <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                            <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
                                    <CreditCard className="w-4 h-4 mr-2" /> Billing Details
                                </h3>
                            </div>
                            <div className="px-4 py-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <input
                                    value={billing.billingName || ""}
                                    onChange={(e) => setBilling({ ...billing, billingName: e.target.value })}
                                    placeholder="Billing name"
                                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                                />
                                <input
                                    value={billing.billingEmail || ""}
                                    onChange={(e) => setBilling({ ...billing, billingEmail: e.target.value })}
                                    placeholder="Billing email"
                                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                                />
                                <input
                                    value={billing.addressLine1 || ""}
                                    onChange={(e) => setBilling({ ...billing, addressLine1: e.target.value })}
                                    placeholder="Address line 1"
                                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                                />
                                <input
                                    value={billing.addressLine2 || ""}
                                    onChange={(e) => setBilling({ ...billing, addressLine2: e.target.value })}
                                    placeholder="Address line 2"
                                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                                />
                                <input
                                    value={billing.city || ""}
                                    onChange={(e) => setBilling({ ...billing, city: e.target.value })}
                                    placeholder="City"
                                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                                />
                                <input
                                    value={billing.state || ""}
                                    onChange={(e) => setBilling({ ...billing, state: e.target.value })}
                                    placeholder="State"
                                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                                />
                                <input
                                    value={billing.country || ""}
                                    onChange={(e) => setBilling({ ...billing, country: e.target.value })}
                                    placeholder="Country"
                                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                                />
                                <input
                                    value={billing.postalCode || ""}
                                    onChange={(e) => setBilling({ ...billing, postalCode: e.target.value })}
                                    placeholder="Postal code"
                                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                                />
                                <input
                                    value={billing.gstNumber || ""}
                                    onChange={(e) => setBilling({ ...billing, gstNumber: e.target.value })}
                                    placeholder="GST Number (optional)"
                                    className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
                                />
                                <div className="sm:col-span-2">
                                    <button
                                        onClick={handleSaveBilling}
                                        disabled={savingBilling}
                                        className="inline-flex items-center rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        {savingBilling ? "Saving..." : "Save billing details"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Invoices List */}
                        <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                            <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200">
                                <h3 className="text-lg leading-6 font-medium text-gray-900">Payment History & Invoices</h3>
                            </div>

                            {invoices.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">No payment history found.</div>
                            ) : (
                                <ul className="divide-y divide-gray-200">
                                    {invoices.map((inv) => (
                                        <li key={inv._id} className="px-4 py-4 sm:px-6 hover:bg-gray-50 transition">
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{inv.invoice_number}</p>
                                                    <p className="text-sm text-gray-500 mt-1 flex items-center">
                                                        {new Date(inv.createdAt).toLocaleDateString()} · {inv.status} · {inv.payment_method || 'Razorpay'}
                                                    </p>
                                                    <p className="text-xs text-gray-400 font-mono mt-1">{inv.transaction_id || inv.razorpay_payment_id}</p>
                                                </div>
                                                <div className="flex items-center space-x-4">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                        ₹{(inv.amount / 100).toFixed(2)}
                                                    </span>
                                                    {inv.status === 'captured' && (
                                                        <button
                                                            onClick={() => handleDownloadInvoice(inv._id, inv.invoice_number)}
                                                            className="text-orange-600 hover:text-orange-900 flex items-center text-sm font-medium bg-orange-50 px-3 py-1.5 rounded"
                                                        >
                                                            <FileDown className="w-4 h-4 mr-1" />
                                                            PDF
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                    </div>
                )}
            </div>
        </Mainlayout>
    );
}
