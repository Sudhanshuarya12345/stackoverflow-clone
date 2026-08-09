import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Mainlayout from "@/layout/Mainlayout";
import axiosInstance from "@/lib/axiosinstance";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import PlanBadge from "@/components/PlanBadge";

type SortMode = "newest" | "active" | "score" | "views" | "answered" | "unanswered" | "bountied";

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

const getQuestionScore = (item: Question) =>
  (item.upvote?.length || 0) - (item.downvote?.length || 0);

const getLastActivityTime = (item: Question) => {
  const answerTimes = (item.answer || []).map((answer) =>
    new Date(answer.answeredon || item.askedon).getTime()
  );
  return Math.max(new Date(item.askedon).getTime(), ...answerTimes);
};

export default function Home() {
  const [question, setquestion] = useState<Question[]>([]);
  const [loading, setloading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [tagText, setTagText] = useState("");
  const router = useRouter();

  useEffect(() => {
    const fetchquestion = async () => {
      try {
        const res = await axiosInstance.get("/question/getallquestion");
        setquestion(res.data.data || []);
      } catch (error) {
        console.log(error);
      } finally {
        setloading(false);
      }
    };
    fetchquestion();
  }, []);

  const bountiedCount = question.filter((item) => item.bounty?.status === "active").length;

  const normalizedSearch = searchText.trim().toLowerCase();
  const normalizedTag = tagText.trim().toLowerCase();
  const filteredQuestions = [...question]
    .filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.questiontitle.toLowerCase().includes(normalizedSearch) ||
        item.questionbody.toLowerCase().includes(normalizedSearch);
      const matchesTag =
        !normalizedTag ||
        item.questiontags.some((tag) => tag.toLowerCase().includes(normalizedTag));
      const matchesUnanswered = sortMode !== "unanswered" || item.noofanswer === 0;
      const matchesBountied = sortMode !== "bountied" || item.bounty?.status === "active";

      return matchesSearch && matchesTag && matchesUnanswered && matchesBountied;
    })
    .sort((a, b) => {
      if (sortMode === "active") return getLastActivityTime(b) - getLastActivityTime(a);
      if (sortMode === "score") return getQuestionScore(b) - getQuestionScore(a);
      if (sortMode === "views") return (b.views || 0) - (a.views || 0);
      if (sortMode === "answered") return (b.noofanswer || 0) - (a.noofanswer || 0);
      if (sortMode === "bountied") return (b.bounty?.amount || 0) - (a.bounty?.amount || 0);
      return new Date(b.askedon).getTime() - new Date(a.askedon).getTime();
    });

  const clearFilters = () => {
    setSearchText("");
    setTagText("");
    setSortMode("newest");
  };

  const buttonClass = (mode: SortMode) =>
    `px-2 sm:px-3 py-1 rounded text-xs sm:text-sm ${sortMode === mode
      ? "bg-gray-200 text-gray-800"
      : "text-gray-600 hover:bg-gray-100"
    }`;

  if (loading) {
    return (
      <Mainlayout>
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </Mainlayout>
    );
  }
  if (!question || question.length === 0) {
    return (
      <Mainlayout>
        <div className="text-center text-gray-500 mt-4">No question found.</div>
      </Mainlayout>
    );
  }

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
              {filteredQuestions.length} of {question.length} questions
            </span>
            <div className="flex w-full flex-wrap gap-1 sm:gap-2">
              <button onClick={() => setSortMode("newest")} className={buttonClass("newest")}>
                Newest
              </button>
              <button onClick={() => setSortMode("active")} className={buttonClass("active")}>
                Active
              </button>
              <button
                onClick={() => setSortMode("bountied")}
                className={`${buttonClass("bountied")} flex items-center`}
              >
                Bountied
                <Badge variant="secondary" className="ml-1 text-xs">
                  {bountiedCount}
                </Badge>
              </button>
              <button onClick={() => setSortMode("unanswered")} className={buttonClass("unanswered")}>
                Unanswered
              </button>
              <button onClick={() => setSortMode("score")} className={buttonClass("score")}>
                Score
              </button>
              <button onClick={() => setSortMode("views")} className={buttonClass("views")}>
                Views
              </button>
              <button onClick={() => setSortMode("answered")} className={buttonClass("answered")}>
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
                placeholder="Search title or body"
                className="rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <input
                value={tagText}
                onChange={(event) => setTagText(event.target.value)}
                placeholder="Filter by tag"
                className="rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <button
                onClick={clearFilters}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-white"
              >
                Clear
              </button>
            </div>
          )}
          <div className="space-y-4">
            {filteredQuestions.length === 0 && (
              <div className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                No questions match the selected filters.
              </div>
            )}
            {filteredQuestions.map((question) => (
              <div key={question._id} className="border-b border-gray-200 pb-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="grid grid-cols-3 sm:flex sm:flex-col items-center text-sm text-gray-600 sm:w-16 lg:w-20 gap-3 sm:gap-2">
                    <div className="text-center">
                      <div className="font-medium">
                        {getQuestionScore(question)}
                      </div>
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
                      <div className="text-xs">
                        {question.noofanswer === 1
                          ? "answer"
                          : "answers"}
                      </div>
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
                    <p className="text-gray-700 text-sm mb-3 line-clamp-2">
                      {question.questionbody}
                    </p>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {question.questiontags.map((tag) => (
                          <button key={tag} onClick={() => { setTagText(tag); setShowFilters(true); }}>
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
                        <Link
                          href={`/users/${question.userid}`}
                          className="flex items-center"
                        >
                          <Avatar className="w-4 h-4 mr-1">
                            <AvatarFallback className="text-xs">
                              {question.userposted[0]}
                            </AvatarFallback>
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
            ))}
          </div>
        </div>
      </main>
    </Mainlayout>
  );
}
