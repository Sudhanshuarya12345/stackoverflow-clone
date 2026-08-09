import Head from "next/head";
import Mainlayout from "@/layout/Mainlayout";
import { useAuth } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Link from "next/link";
import { LifeBuoy, Mail, ShieldCheck, UserPlus, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SupportPage() {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<any[]>([]);
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    Promise.all([
      axiosInstance.get("/api/support/info").then((r) => r.data),
      axiosInstance.get("/api/support/tickets").then((r) => r.data.data),
    ])
      .then(([infoRes, ticketRes]) => {
        setInfo(infoRes);
        setTickets(ticketRes || []);
      })
      .catch(() => {
        toast.error("Failed to load support data");
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Please fill in subject and message");
      return;
    }
    setSubmitting(true);
    try {
      const res = await axiosInstance.post("/api/support/tickets", { subject, message });
      setTickets((prev) => [res.data.data, ...prev]);
      setSubject("");
      setMessage("");
      toast.success("Support ticket submitted");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <Mainlayout>
        <div className="max-w-2xl mx-auto py-16 text-center">
          <p className="text-gray-600">Please log in to access support.</p>
          <Link href="/auth" className="mt-4 inline-block text-blue-600 hover:underline">
            Log in
          </Link>
        </div>
      </Mainlayout>
    );
  }

  const priorityColor = info?.priority === "highest" ? "bg-red-100 text-red-700" : info?.priority === "priority" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700";

  return (
    <Mainlayout>
      <Head>
        <title>Support - StackOverflow</title>
      </Head>
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Badge className="bg-blue-100 text-blue-700"><ShieldCheck className="w-4 h-4 mr-1" /> Priority Support</Badge>
        </h1>

        {!loading && (
          <div className={`mb-6 rounded border p-4 text-sm ${priorityColor}`}>
            <div className="flex items-center gap-2">
              {info?.priority === "highest" ? (
                <Zap className="w-4 h-4" />
              ) : info?.priority === "priority" ? (
                <ShieldCheck className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              <span>{info?.message}</span>
            </div>
            {user.plan === "free" || user.plan === "bronze" ? (
              <Link href="/subscription" className="mt-3 inline-block text-blue-600 hover:underline font-medium">
                Upgrade to Silver/Gold for priority support →
              </Link>
            ) : null}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Submit a support request</h2>
          <div className="space-y-4">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue..."
              rows={4}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none"
            />
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Ticket"}
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your tickets</h2>
          {tickets.length === 0 ? (
            <p className="text-gray-500 text-sm">No support tickets yet.</p>
          ) : (
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg bg-white">
              {tickets.map((ticket) => (
                <li key={ticket._id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{ticket.subject}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(ticket.createdAt).toLocaleDateString()} · priority: {ticket.priority}
                      </p>
                    </div>
                    <span className={`ml-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ticket.status === "resolved" || ticket.status === "closed"
                      ? "bg-green-100 text-green-700"
                      : ticket.status === "in_progress"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-600"
                      }`}>
                      {ticket.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Mainlayout>
  );
}