import { Bookmark, Check, ChevronDown, ChevronUp, Clock, History, Lock, MessageSquare, Share, Trash } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import Link from "next/link";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { toast } from "react-toastify";
import { useRouter } from "next/router";
import axiosInstance from "@/lib/axiosinstance";
import { useAuth } from "@/lib/AuthContext";
import { useI18n } from "@/lib/i18n";
import { renderMarkdown } from "@/lib/markdown";
import PlanBadge from "@/components/PlanBadge";

const CLOSE_VOTE_THRESHOLD = 250;
const COMMENT_THRESHOLD = 50;

type VoteBoxProps = { score: number; myVote: "up" | "down" | null; onVote: (v: "upvote" | "downvote") => void; children?: React.ReactNode };

const VoteBox = ({ score, myVote, onVote, children }: VoteBoxProps) => {
  const { t } = useI18n();
  return (
    <div className="flex sm:flex-col items-center gap-1 p-3 sm:p-6 border-b sm:border-b-0 sm:border-r border-gray-200">
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("q.upvote")}
        className={`p-2 ${myVote === "up" ? "text-orange-600" : "text-gray-600 hover:text-orange-500"}`}
        onClick={() => onVote("upvote")}
      >
        <ChevronUp className="w-6 h-6" />
      </Button>
      <span className="min-w-6 text-center font-semibold">{score}</span>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("q.downvote")}
        className={`p-2 ${myVote === "down" ? "text-orange-600" : "text-gray-600 hover:text-orange-500"}`}
        onClick={() => onVote("downvote")}
      >
        <ChevronDown className="w-6 h-6" />
      </Button>
      {children}
    </div>
  );
};

const CommentList = ({
  comments,
  onSubmit,
  canComment,
}: {
  comments: any[];
  onSubmit: (body: string) => Promise<boolean>;
  canComment: boolean;
}) => {
  const { t, formatDate } = useI18n();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  return (
    <div className="mt-4 border-t pt-3">
      {comments.length > 0 && (
        <ul className="mb-2 space-y-1">
          {comments.map((c: any) => (
            <li key={c._id} className="break-words border-b border-gray-100 pb-1 text-sm text-gray-700">
              {c.body} –{" "}
              <Link href={`/users/${c.userid}`} className="text-blue-600 hover:underline">
                {c.usercommented}
              </Link>{" "}
              <span className="text-xs text-gray-400">{formatDate(c.commentedon)}</span>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            if (await onSubmit(body.trim())) {
              setBody("");
              setOpen(false);
            }
          }}
        >
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="flex-1 rounded border px-3 py-2 text-sm"
            placeholder={t("q.commentPlaceholder")}
            autoFocus
          />
          <Button type="submit" size="sm" variant="outline">
            {t("q.addComment")}
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600">
          <MessageSquare className="h-3 w-3" /> {t("q.addComment")}
          {!canComment && <span className="text-gray-400">({t("q.commentRestricted", { min: COMMENT_THRESHOLD })})</span>}
        </button>
      )}
    </div>
  );
};

const QuestionDetail = ({ questionId }: any) => {
  const router = useRouter();
  const { t, formatDate } = useI18n();
  const [question, setquestion] = useState<any>(null);
  const [newanswer, setnewAnswer] = useState("");
  const [isSubmitting, setisSubmitting] = useState(false);
  const [loading, setloading] = useState(true);
  const { user, updateLocalUser, refreshUser } = useAuth();
  const [bountyAmount, setBountyAmount] = useState(50);

  useEffect(() => {
    if (!questionId) return;
    const load = async () => {
      try {
        const res = await axiosInstance.get(`/question/${questionId}`);
        setquestion(res.data.data);
        axiosInstance.patch(`/question/${questionId}/view`).catch(() => {});
      } catch (error) {
        console.log(error);
      } finally {
        setloading(false);
      }
    };
    load();
  }, [questionId]);

  if (loading) {
    return <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>;
  }
  if (!question) {
    return <div className="text-center text-gray-500 mt-4">{t("q.notFound")}</div>;
  }

  const requireLogin = () => {
    if (user) return true;
    toast.info(t("common.loginToContinue"));
    router.push("/auth");
    return false;
  };
  const replaceQuestion = (data: any) => setquestion((prev: any) => ({ ...data, isBookmarked: prev?.isBookmarked }));
  const apiError = (error: any, fallback: string) => toast.error(error.response?.data?.message || fallback);
  const myReputation = user?.reputation ?? 0;
  const isAdmin = user?.role === "admin";

  const handleVote = async (vote: "upvote" | "downvote") => {
    if (!requireLogin()) return;
    try {
      const res = await axiosInstance.patch(`/question/vote/${question._id}`, { value: vote });
      replaceQuestion(res.data.data);
    } catch (error) {
      apiError(error, t("q.voteFailed"));
    }
  };
  const handleAnswerVote = async (answerId: string, vote: "upvote" | "downvote") => {
    if (!requireLogin()) return;
    try {
      const res = await axiosInstance.patch(`/question/${question._id}/answers/${answerId}/vote`, { value: vote });
      replaceQuestion(res.data.data);
    } catch (error) {
      apiError(error, t("q.voteFailed"));
    }
  };
  const handleAccept = async (answerId: string) => {
    try {
      const res = await axiosInstance.patch(`/question/${question._id}/answers/${answerId}/accept`);
      replaceQuestion(res.data.data);
      toast.success(t("q.acceptUpdated"));
    } catch (error) {
      apiError(error, t("common.error"));
    }
  };
  const handleCloseVote = async () => {
    if (!requireLogin()) return;
    if (!window.confirm(t("q.confirmClose"))) return;
    try {
      const res = await axiosInstance.post(`/question/${question._id}/close`);
      replaceQuestion(res.data.data);
      toast.success(res.data.data.closed ? t("q.closedNow") : t("q.closeVoteRecorded"));
    } catch (error) {
      apiError(error, t("common.error"));
    }
  };
  const handlebookmark = async () => {
    if (!requireLogin()) return;
    try {
      const res = await axiosInstance.patch(`/question/bookmark/${question._id}`);
      setquestion((prev: any) => ({ ...prev, isBookmarked: res.data.bookmarked }));
      toast.success(res.data.bookmarked ? t("q.bookmarked") : t("q.bookmarkRemoved"));
    } catch (error) {
      apiError(error, t("q.bookmarkFailed"));
    }
  };
  const handleStartBounty = async () => {
    if (!requireLogin()) return;
    try {
      const res = await axiosInstance.post(`/question/${question._id}/bounty/start`, { amount: bountyAmount });
      replaceQuestion({ ...res.data.data, userplan: question.userplan, answer: question.answer });
      updateLocalUser?.({ reputation: res.data.reputation });
      toast.success(t("q.bountyStarted", { amount: bountyAmount }));
    } catch (error) {
      apiError(error, t("q.bountyFailed"));
    }
  };
  const handleAwardBounty = async (answerId: string) => {
    if (!requireLogin()) return;
    if (!window.confirm(t("q.confirmAward"))) return;
    try {
      const res = await axiosInstance.patch(`/question/${question._id}/bounty/award/${answerId}`);
      replaceQuestion(res.data.data);
      toast.success(t("q.bountyAwarded"));
    } catch (error) {
      apiError(error, t("q.bountyFailed"));
    }
  };
  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("q.linkCopied"));
    } catch {
      toast.info(url);
    }
  };
  const handleHistory = () => {
    const latestActivity = Math.max(
      new Date(question.askedon).getTime(),
      ...(question.answer || []).map((ans: any) => new Date(ans.answeredon || question.askedon).getTime())
    );
    toast.info(t("q.historyInfo", { asked: formatDate(question.askedon), latest: formatDate(latestActivity) }));
  };
  const handleSubmitanswer = async () => {
    if (!requireLogin()) return;
    if (!newanswer.trim()) return;
    setisSubmitting(true);
    try {
      const res = await axiosInstance.post(`/answer/postanswer/${question?._id}`, { answerbody: newanswer });
      replaceQuestion(res.data.data);
      setnewAnswer("");
      toast.success(t("q.answerPosted"));
      refreshUser?.();
    } catch (error) {
      apiError(error, t("q.answerFailed"));
    } finally {
      setisSubmitting(false);
    }
  };
  const handleDelete = async () => {
    if (!requireLogin()) return;
    if (!window.confirm(t("q.confirmDeleteQuestion"))) return;
    try {
      await axiosInstance.delete(`/question/delete/${question._id}`);
      toast.success(t("q.questionDeleted"));
      router.push("/");
    } catch (error) {
      apiError(error, t("q.deleteFailed"));
    }
  };
  const handleDeleteanswer = async (id: string, own: boolean) => {
    if (!requireLogin()) return;
    if (!window.confirm(own ? t("q.confirmDeleteAnswerOwn") : t("q.confirmDeleteAnswer"))) return;
    try {
      const res = await axiosInstance.delete(`/answer/delete/${question._id}`, { data: { answerid: id } });
      replaceQuestion(res.data.data);
      toast.success(t("q.answerDeleted"));
      refreshUser?.();
    } catch (error) {
      apiError(error, t("q.deleteFailed"));
    }
  };
  const submitQuestionComment = async (body: string) => {
    if (!requireLogin()) return false;
    try {
      const res = await axiosInstance.post(`/question/${question._id}/comments`, { body });
      replaceQuestion(res.data.data);
      return true;
    } catch (error) {
      apiError(error, t("common.error"));
      return false;
    }
  };
  const submitAnswerComment = (answerId: string) => async (body: string) => {
    if (!requireLogin()) return false;
    try {
      const res = await axiosInstance.post(`/question/${question._id}/answers/${answerId}/comments`, { body });
      replaceQuestion(res.data.data);
      return true;
    } catch (error) {
      apiError(error, t("common.error"));
      return false;
    }
  };

  const myVote = (doc: any): "up" | "down" | null =>
    user && doc.upvote?.includes(user._id) ? "up" : user && doc.downvote?.includes(user._id) ? "down" : null;
  const score = (doc: any) => (doc.upvote?.length || 0) - (doc.downvote?.length || 0);
  const isQuestionOwner = question.userid === user?._id;
  const closeVotes: string[] = question.closeVotes || [];
  const alreadyVotedClose = Boolean(user && closeVotes.includes(user._id));
  const canComment = isAdmin || myReputation >= COMMENT_THRESHOLD;

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="break-words text-xl lg:text-2xl font-semibold mb-4 text-gray-900">
          {question.questiontitle}
          {question.closed && <span className="ml-2 text-base font-normal text-gray-500">[{t("q.closedTag")}]</span>}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-4">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>
              {t("q.asked")} {formatDate(question.askedon)}
            </span>
          </div>
          <span>{t("q.views", { count: question.views || 0 })}</span>
          <span>{t("q.score", { count: score(question) })}</span>
        </div>
        {question.closed && (
          <div className="mb-3 flex items-start gap-2 rounded border border-gray-300 bg-gray-50 p-3 text-sm text-gray-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("q.closedBanner", { date: formatDate(question.closedAt || Date.now()) })}</span>
          </div>
        )}
        {question.bounty?.status === "active" && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {t("q.bountyActive", { amount: question.bounty.amount, date: formatDate(question.bounty.expiresAt) })}
          </div>
        )}
        {question.bounty?.status === "awarded" && (
          <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {t("q.bountyAwardedBanner", { amount: question.bounty.amount })}
          </div>
        )}
      </div>

      <Card className="mb-8">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row">
            <VoteBox score={score(question)} myVote={myVote(question)} onVote={handleVote}>
              <div className="flex sm:flex-col gap-2 sm:gap-4 ml-auto sm:ml-0 sm:mt-6">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("q.bookmark")}
                  className={`p-2 ${question?.isBookmarked ? "text-yellow-500" : "text-gray-600 hover:text-yellow-500"}`}
                  onClick={handlebookmark}
                >
                  <Bookmark className="w-5 h-5" fill={question?.isBookmarked ? "currentColor" : "none"} />
                </Button>
                <Button variant="ghost" size="sm" aria-label={t("q.history")} className="p-2 text-gray-600 hover:text-gray-800" onClick={handleHistory}>
                  <History className="w-5 h-5" />
                </Button>
              </div>
            </VoteBox>
            <div className="flex-1 min-w-0 p-4 sm:p-6">
              <div className="prose max-w-none mb-6 break-words">
                <div className="text-gray-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(question.questionbody) }} />
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                {question.questiontags.map((tag: any) => (
                  <Badge key={tag} variant="secondary" className="bg-blue-100 text-blue-800">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-800" onClick={handleShare}>
                    <Share className="w-4 h-4 mr-1" />
                    {t("q.share")}
                  </Button>
                  {!question.closed && !isQuestionOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-600 hover:text-gray-800"
                      disabled={alreadyVotedClose}
                      onClick={() =>
                        isAdmin || myReputation >= CLOSE_VOTE_THRESHOLD
                          ? handleCloseVote()
                          : toast.info(t("q.closeNeedsRep", { min: CLOSE_VOTE_THRESHOLD }))
                      }
                    >
                      <Lock className="w-4 h-4 mr-1" />
                      {t("q.close")} {closeVotes.length > 0 && `(${closeVotes.length}/${question.closeVotesRequired || 3})`}
                    </Button>
                  )}
                  {(isQuestionOwner || isAdmin) && (
                    <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-800">
                      <Trash className="w-4 h-4 mr-1" />
                      {t("common.delete")}
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">
                    {t("q.asked")} {formatDate(question.askedon)}
                  </span>
                  <Link href={`/users/${question.userid}`} className="flex items-center gap-2 hover:bg-blue-50 p-2 rounded">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-sm">{question.userposted?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex items-center text-blue-600 hover:text-blue-800 font-medium">
                      {question.userposted}
                      {question.userplan && <PlanBadge plan={question.userplan} />}
                    </div>
                  </Link>
                </div>
              </div>
              <CommentList comments={question.comments || []} onSubmit={submitQuestionComment} canComment={canComment || isQuestionOwner} />
              {!question.closed && question.bounty?.status !== "active" && question.bounty?.status !== "awarded" && (
                <div className="mt-6 rounded border border-gray-200 bg-gray-50 p-3">
                  <div className="mb-3 text-sm font-medium text-gray-900">{t("q.startBounty")}</div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <select
                      value={bountyAmount}
                      onChange={(event) => setBountyAmount(Number(event.target.value))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      {[50, 100, 200, 500].map((amount) => (
                        <option key={amount} value={amount}>
                          {t("q.bountyOption", { amount })}
                        </option>
                      ))}
                    </select>
                    <Button onClick={handleStartBounty} className="bg-amber-600 text-white hover:bg-amber-700">
                      {t("q.startBountyButton")}
                    </Button>
                    <span className="text-xs text-gray-600">{t("q.bountyNote", { reputation: myReputation })}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-6 text-gray-900">{t("q.answersCount", { count: question.answer.length })}</h2>
        <div className="space-y-6">
          {question.answer.map((ans: any) => {
            const ownAnswer = ans.userid === user?._id;
            return (
              <Card key={ans._id} className={ans.isAccepted ? "border-green-400" : ""}>
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    <VoteBox score={score(ans)} myVote={myVote(ans)} onVote={(v) => handleAnswerVote(ans._id, v)}>
                      {isQuestionOwner ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={ans.isAccepted ? t("q.unaccept") : t("q.accept")}
                          title={ans.isAccepted ? t("q.unaccept") : t("q.accept")}
                          className={`ml-auto sm:ml-0 sm:mt-4 p-2 ${ans.isAccepted ? "text-green-600" : "text-gray-400 hover:text-green-600"}`}
                          onClick={() => handleAccept(ans._id)}
                        >
                          <Check className="w-6 h-6" />
                        </Button>
                      ) : (
                        ans.isAccepted && <Check className="ml-auto sm:ml-0 sm:mt-4 w-6 h-6 text-green-600" aria-label={t("q.accepted")} />
                      )}
                    </VoteBox>
                    <div className="flex-1 min-w-0 p-4 sm:p-6">
                      <div className="prose max-w-none mb-6 break-words">
                        <div className="text-gray-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(ans.answerbody) }} />
                      </div>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-800" onClick={handleShare}>
                            <Share className="w-4 h-4 mr-1" />
                            {t("q.share")}
                          </Button>
                          {question.bounty?.status === "active" &&
                            (isQuestionOwner || question.bounty.startedBy === user?._id) &&
                            !ownAnswer && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAwardBounty(ans._id)}
                                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                              >
                                {t("q.award", { amount: question.bounty.amount })}
                              </Button>
                            )}
                          {(ownAnswer || isAdmin) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteanswer(ans._id, ownAnswer)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash className="w-4 h-4 mr-1" />
                              {t("common.delete")}
                            </Button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-gray-600">
                            {t("q.answered")} {formatDate(ans.answeredon)}
                          </span>
                          {ans.isAccepted && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{t("q.accepted")}</Badge>}
                          <Link href={`/users/${ans.userid}`} className="flex items-center gap-2 hover:bg-blue-50 p-2 rounded">
                            <Avatar className="w-8 h-8">
                              <AvatarFallback className="text-sm">{ans.useranswered?.[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex items-center text-blue-600 hover:text-blue-800 font-medium">
                              {ans.useranswered}
                              {ans.userplan && <PlanBadge plan={ans.userplan} />}
                            </div>
                          </Link>
                        </div>
                      </div>
                      <CommentList
                        comments={ans.comments || []}
                        onSubmit={submitAnswerComment(ans._id)}
                        canComment={canComment || ownAnswer || isQuestionOwner}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      {question.closed ? (
        <p className="rounded border bg-gray-50 p-4 text-sm text-gray-600">{t("q.closedNoAnswers")}</p>
      ) : (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">{t("q.yourAnswer")}</h3>
            <Textarea
              placeholder={t("q.answerPlaceholder")}
              value={newanswer}
              onChange={(e) => setnewAnswer(e.target.value)}
              className="min-h-32 mb-4 resize-y"
            />
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <Button
                onClick={handleSubmitanswer}
                disabled={!newanswer.trim() || isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? t("q.posting") : t("q.postAnswer")}
              </Button>
              <p className="text-sm text-gray-600">{t("q.answerRepHint")}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default QuestionDetail;
