import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Mainlayout from "@/layout/Mainlayout";
import axiosInstance from "@/lib/axiosinstance";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import PlanBadge from "@/components/PlanBadge";
import { useAuth } from "@/lib/AuthContext";

type SortMode = "newest" | "active" | "score" | "views" | "answered" | "bountied" | "unanswered";

type Question = {
  _id: string;
  questiontitle: string;
  questionbody: string;
  questiontags: string[];
  noofanswer: number;
  views?: number;
  favorites?: string[];
  bounty?: {
    amount?: number;
    status?: "none" | "active" | "awarded" | "expired";
    expiresAt?: string;
  };
  upvote: string[];
  downvote?: string[];
  userposted: string;
  userid: string;
  userplan?: string;
  askedon: string;
  answer: { answeredon?: string }[];
};

const PLAN_LEVELS: Record<string, number> = {
  free: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};

const getQuestionScore = (item: Question) =>
  (item.upvote?.length || 0) - (item.downvote?.length || 0);

export default function Home() {
  const { user, authReady } = useAuth();
  const [question, setquestion] = useState<Question[]>([]);
  const [loading, setloading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [tagText, setTagText] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const router = useRouter();

  const planLevel = PLAN_LEVELS[user?.plan] ?? 0;
  const isBronzePlus = authReady && planLevel >= 1;

  const fetchQuestions = useCallback(
    async (params: Record<string, string | undefined>, { append = false }: { append?: boolean } = {}) => {
      const doFetch = async (targetPage: number, appendMode: boolean) => {
        if (appendMode) setLoadingMore(true);
        else setloading(true);
        setError("");
        try {
          const query = new URLSearchParams();
          Object.entries(params).forEach(([key, value]) => {
            if (value) query.set(key, value);
          });
          query.set("page", String(targetPage));
          query.set("limit", "15");
          const res = await axiosInstance.get(
            query.toString() ? `/question/getallquestion?${query.toString()}` : "/question/getallquestion"
          );
          const { data = [], total: fetchedTotal = 0, totalPages: fetchedTotalPages = 1 } = res.data;
          setTotal(fetchedTotal);
          setTotalPages(fetchedTotalPages || 1);
          setPage(targetPage);
          if (appendMode) {
            setquestion((prev) => [...prev, ...(data || [])]);
          } else {
            setquestion(data || []);
          }
        } catch (error: any) {
          if (error.response?.status === 403) {
            setError(error.response?.data?.message || "Advanced filters require a Bronze plan or higher.");
          } else {
            console.log(error);
          }
        } finally {
          if (appendMode) setLoadingMore(false);
          else setloading(false);
        }
      };
      if (append) {
        setPage((prevPage) => {
          doFetch(prevPage + 1, true);
          return prevPage;
        });
      } else {
        doFetch(1, false);
      }
    },
    []
  );

  useEffect(() => {
    const qParam = typeof router.query.q === "string" ? router.query.q : "";
    if (qParam) {
      setSearchText(qParam);
      fetchQuestions({ q: qParam });
    } else {
      fetchQuestions({});
    }
  }, [fetchQuestions, router.query.q]);

  const buildParams = (modeOverride?: SortMode) => {
    const mode = modeOverride ?? sortMode;
    const params: Record<string, string> = {};
    if (searchText.trim()) params.q = searchText.trim();
    if (isBronzePlus) {
      if (tagText.trim()) params.tag = tagText.trim();
      if (mode === "unanswered") params.unanswered = "true";
      else if (mode !== "newest") params.sort = mode;
      if (mode === "bountied") params.bountied = "true";
    }
    return params;
  };

  const applySearch = () => {
    if (tagText.trim() && !isBronzePlus) {
      setError("Tag filtering requires a Bronze plan or higher.");
      return;
    }
    fetchQuestions(buildParams());
  };

  const handleSort = (mode: SortMode) => {
    if (mode !== "newest" && !isBronzePlus) {
      setError(
        mode === "unanswered"
          ? "Advanced filters (unanswered) require a Bronze plan or higher."
          : "Advanced sorting requires a Bronze plan or higher."
      );
      router.push("/subscription");
      return;
    }
    setSortMode(mode);
    fetchQuestions(buildParams(mode));
  };

  const handleTagClick = (tag: string) => {
    if (!isBronzePlus) {
      setError("Tag filtering requires a Bronze plan or higher.");
      router.push("/subscription");
      return;
    }
    setTagText(tag);
    setShowFilters(true);
    fetchQuestions({ ...buildParams(), tag });
  };

  const clearFilters = () => {
    setSearchText("");
    setTagText("");
    setSortMode("newest");
    setError("");
    fetchQuestions({});
  };

  const loadMore = () => {
    fetchQuestions(buildParams(), { append: true });
  };

  const bountiedCount = question.filter((item) => item.bounty?.status === "active").length;

  const buttonClass = (mode: string) =>
    `px-2 sm:px-3 py-1 rounded text-xs sm:text-sm ${sortMode === mode
      ? "bg-gray-200 text-gray-800"
      : "text-gray-600 hover:bg-gray-100"
    }`;

  const showPageSpinner = loading && question.length === 0;

  return (
    <Mainlayout>
      <main className="min-w-0 p-4 lg:p-6 ">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-6 gap-4">
          <h1 className="text-xl lg:text-2xl font-semibold">Top Questions</h1>
          <button
            onClick={() => router.push("/ask")}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium whitespace-nowrap"
          >
            Ask Question
          </button>
        </div>
        <div className="w-full">
          <div className="flex flex-col lg:flex-row items-start lg:items-center mb-4 text-sm gap-3 lg:gap-4">
            <span className="text-gray-600 whitespace-nowrap">
              {total} {total === 1 ? "question" : "questions"}
            </span>
            <div className="flex w-full flex-wrap gap-1 sm:gap-2">
              <button onClick={() => handleSort("newest")} className={buttonClass("newest")}>
                Newest
              </button>
              <button onClick={() => handleSort("active")} className={buttonClass("active")}>
                Active
              </button>
              <button
                onClick={() => handleSort("bountied")}
                className={`${buttonClass("bountied")} flex items-center`}
              >
                Bountied
                <Badge variant="secondary" className="ml-1 text-xs">
                  {bountiedCount}
                </Badge>
              </button>
              <button onClick={() => handleSort("unanswered")} className={buttonClass("unanswered")}>
                Unanswered
              </button>
              <button onClick={() => handleSort("score")} className={buttonClass("score")}>
                Score
              </button>
              <button onClick={() => handleSort("views")} className={buttonClass("views")}>
                Views
              </button>
              <button onClick={() => handleSort("answered")} className={buttonClass("answered")}>
                Most Answered
              </button>
              <button
                onClick={() => setShowFilters((current) => !current)}
                className="px-2 sm:px-3 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded sm:ml-auto text-xs sm:text-sm"
              >
                🔍 Filter
              </button>
            </div>
          </div>
          {showFilters && (
            <div className="mb-4 grid gap-3 rounded border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[1fr_220px_auto]">
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && applySearch()}
                placeholder="Search title or body"
                className="rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <input
                value={tagText}
                onChange={(event) => setTagText(event.target.value)}
                disabled={!isBronzePlus}
                placeholder={isBronzePlus ? "Filter by tag" : "Filter by tag (Bronze+)"}
                className="rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
              <button
                onClick={applySearch}
                className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
              >
                Apply
              </button>
              <button
                onClick={clearFilters}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-white"
              >
                Clear
              </button>
            </div>
          )}
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {!isBronzePlus && (
            <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              Basic search is available on the Free plan.{" "}
              <Link href="/subscription" className="text-blue-600 hover:underline">
                Upgrade to Bronze+
              </Link>{" "}
              for advanced search filters (tag, unanswered, score, views, most answered).
            </div>
          )}
          <div className="space-y-4">
            {showPageSpinner ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
              </div>
            ) : question.length === 0 ? (
              <div className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                No questions match the selected filters.
              </div>
            ) : (
              question.map((question) => (
                <div key={question._id} className="border-b border-gray-200 pb-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="grid grid-cols-3 sm:flex sm:flex-col items-center text-sm text-gray-600 sm:w-16 lg:w-20 gap-3 sm:gap-2">
                      <div className="text-center">
                        <div className="font-medium">{getQuestionScore(question)}</div>
                        <div className="text-xs">votes</div>
                      </div>
                      <div className="text-center">
                        <div
                          className={`font-medium ${question.answer.length > 0
                            ? "text-green-600 bg-green-100 px-2 py-1 rounded"
                            : ""
                            }`}
                        >
                          {question.noofanswer}
                        </div>
                        <div className="text-xs">{question.noofanswer === 1 ? "answer" : "answers"}</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium">{question.views || 0}</div>
                        <div className="text-xs">views</div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      {question.bounty?.status === "active" && (
                        <Badge className="mb-2 bg-amber-100 text-amber-800 hover:bg-amber-100">
                          +{question.bounty.amount} bounty
                        </Badge>
                      )}
                      <Link
                        href={`/questions/${question._id}`}
                        className="break-words text-blue-600 hover:text-blue-800 text-base lg:text-lg font-medium mb-2 block"
                      >
                        {question.questiontitle}
                      </Link>
                      <p className="text-gray-700 text-sm mb-3 line-clamp-2">{question.questionbody}</p>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {question.questiontags.map((tag) => (
                            <button key={tag} onClick={() => handleTagClick(tag)}>
                              <Badge
                                variant="secondary"
                                className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer"
                              >
                                {tag}
                              </Badge>
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-1 text-xs text-gray-600 flex-shrink-0">
                          <Link href={`/users/${question.userid}`} className="flex items-center">
                            <Avatar className="w-4 h-4 mr-1">
                              <AvatarFallback className="text-xs">{question.userposted[0]}</AvatarFallback>
                            </Avatar>
                            <span className="text-blue-600 hover:text-blue-800 mr-1 flex items-center">
                              {question.userposted}
                              {question.userplan && <PlanBadge plan={question.userplan} />}
                            </span>
                          </Link>

                          <span>asked {new Date(question.askedon).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {page < totalPages && question.length > 0 && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded text-sm disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </div>
      </main>
    </Mainlayout>
  );
}