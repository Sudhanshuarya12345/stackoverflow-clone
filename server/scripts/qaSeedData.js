import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const BASE_URL = process.env.QA_SEED_BASE_URL || "http://localhost:5000";
const PASSWORD = "Test@12345";
const TOTAL_USERS = Number(process.env.QA_SEED_USERS || 150);
const TOTAL_QUESTIONS = Number(process.env.QA_SEED_QUESTIONS || 1050);
const CONCURRENCY = Number(process.env.QA_SEED_CONCURRENCY || 15);

const tags = [
  "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Express", "MongoDB", "Docker", "Redis",
  "Python", "Java", "C++", "SQL", "Linux", "Git", "HTML", "CSS", "Tailwind", "AWS", "DevOps",
  "Cyber Security", "Machine Learning", "AI",
];

const firstNames = [
  "Aarav", "Aisha", "Liam", "Sophia", "Noah", "Emma", "Lucas", "Mia", "Hiroshi", "Yuki", "Chen", "Mei",
  "Mateo", "Valentina", "Omar", "Fatima", "Ivan", "Anastasia", "Kwame", "Ama", "Luca", "Giulia", "Carlos",
  "Camila", "Arjun", "Priya", "Ahmed", "Layla", "Ethan", "Olivia", "Sofia", "Diego", "Nora", "Leah",
];
const lastNames = [
  "Sharma", "Khan", "Smith", "Johnson", "Tanaka", "Sato", "Wang", "Li", "Garcia", "Martinez", "Hassan",
  "Ivanov", "Mensah", "Rossi", "Bianchi", "Patel", "Nguyen", "Brown", "Wilson", "Silva", "Muller", "Dubois",
];
const levels = ["Beginner", "Student", "Professional", "Expert"];
const planTargets = { free: 0.8, bronze: 0.1, silver: 0.07, gold: 0.03 };
const planAmounts = { bronze: 9900, silver: 29900, gold: 99900 };
const planLimits = { free: 1, bronze: 5, silver: 15, gold: Infinity };
const failures = [];
const stats = { users: 0, subscriptions: 0, questions: 0, answers: 0, comments: 0, votes: 0, bookmarks: 0 };
const unsupported = ["comments", "views", "favorites", "accepted answers"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const choice = (arr) => arr[rand(0, arr.length - 1)];
const sample = (arr, count) => [...arr].sort(() => Math.random() - 0.5).slice(0, count);
const isoDaysAgo = (maxDays) => new Date(Date.now() - rand(0, maxDays) * 24 * 60 * 60 * 1000 - rand(0, 86400000)).toISOString();

const logProgress = (phase) => {
  console.log(JSON.stringify({ at: new Date().toISOString(), phase, stats, failures: failures.length }));
};

async function request(path, options = {}, attempt = 1) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
    return body;
  } catch (error) {
    if (attempt < 3) {
      await sleep(500 * attempt);
      return request(path, options, attempt + 1);
    }
    failures.push({ path, method: options.method || "GET", error: error.message });
    throw error;
  }
}

async function mapLimit(items, limit, worker) {
  const results = [];
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      try { results[current] = await worker(items[current], current); } catch { results[current] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results.filter(Boolean);
}

function authHeader(user) {
  return { Authorization: `Bearer ${user.token}` };
}

function makeUser(index) {
  const first = choice(firstNames);
  const last = choice(lastNames);
  const suffix = `${Date.now()}${index}`;
  const username = `${first}.${last}.${index}`.toLowerCase().replace(/[^a-z0-9.]/g, "");
  const level = choice(levels);
  return {
    name: `${first} ${last}`,
    email: `${username}.${suffix}@qa-seed.example.com`,
    password: PASSWORD,
    level,
    about: `${level} developer from the global QA community. Interested in ${sample(tags, 3).join(", ")}.`,
    tags: sample(tags, rand(2, 6)),
  };
}

function desiredPlan(index) {
  const ratio = index / TOTAL_USERS;
  if (ratio < planTargets.free) return "free";
  if (ratio < planTargets.free + planTargets.bronze) return "bronze";
  if (ratio < planTargets.free + planTargets.bronze + planTargets.silver) return "silver";
  return "gold";
}

function questionPayload(index, author) {
  const difficulty = index % 20 < 8 ? "beginner" : index % 20 < 15 ? "intermediate" : "advanced";
  const mainTag = choice(tags);
  const selectedTags = [...new Set([mainTag, ...sample(tags, rand(0, 4))])].slice(0, 5);
  const titles = {
    beginner: [
      `How do I fix a basic ${mainTag} error in my project?`,
      `Why is my ${mainTag} code returning undefined?`,
      `How to structure a small ${mainTag} application?`,
    ],
    intermediate: [
      `How to optimize ${mainTag} performance with real-world data?`,
      `${mainTag} integration breaks after deployment`,
      `Best way to handle authentication in a ${mainTag} stack?`,
    ],
    advanced: [
      `Race condition in distributed ${mainTag} workflow under load`,
      `How to debug memory leaks in production ${mainTag} services?`,
      `Designing scalable ${mainTag} architecture for high traffic`,
    ],
  };
  const code = Math.random() < 0.72
    ? `\n\n\`\`\`js\nasync function runExample(input) {\n  const result = await service.process(input);\n  console.log(result);\n  return result;\n}\n\`\`\``
    : "";
  return {
    postquestiondata: {
      questiontitle: `${choice(titles[difficulty])} #${index + 1}`,
      questionbody: `I am working on a ${difficulty} level problem involving ${selectedTags.join(", ")}. The issue appears after a recent change and I need help understanding the root cause. What should I check first, and is there a cleaner implementation pattern?${code}`,
      questiontags: selectedTags,
      userposted: author.name,
      userid: author._id,
      askedon: isoDaysAgo(60),
    },
  };
}

function answerBody(question, index) {
  const variants = [
    "You should first isolate the failing case and verify the input shape. In many cases the bug is caused by an unexpected null value or stale environment variable.",
    "This usually happens when the async operation is not awaited. Add explicit error handling and log the response before transforming it.",
    "A cleaner approach is to split the logic into validation, persistence, and response formatting. That makes the failure easier to locate.",
    "I would check the package/runtime version first. Some behavior changed between versions and the fix may be as simple as updating the configuration.",
    "This answer is only a partial workaround, but it should unblock you while you investigate the root cause.",
  ];
  return `${choice(variants)}\n\nExample note ${index + 1}: keep the solution small and add a regression test for this question (${question._id}).`;
}

async function activatePremium(user, plan) {
  const created = await request("/api/subscriptions/create", {
    method: "POST",
    headers: authHeader(user),
    body: JSON.stringify({ plan }),
  });
  const now = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: `evt_qa_${plan}_${user._id}_${Date.now()}`,
    type: "subscription.charged",
    created_at: now,
    payload: {
      subscription: { entity: { id: created.subscription_id, current_start: now, current_end: now + 30 * 24 * 60 * 60 } },
      payment: { entity: { id: `pay_qa_${plan}_${user._id}_${Date.now()}`, amount: planAmounts[plan], currency: "INR", method: "card" } },
    },
  });
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(Buffer.from(body)).digest("hex");
  await request("/api/webhooks/razorpay", {
    method: "POST",
    headers: { "x-razorpay-signature": signature },
    body,
  });
  const synced = await request("/api/subscriptions/me", { headers: authHeader(user) });
  user.plan = synced.userPlanDetails?.plan || plan;
  stats.subscriptions += 1;
}

async function main() {
  const started = Date.now();
  const timer = setInterval(() => logProgress("running"), 60000);
  logProgress("start");

  const rawUsers = Array.from({ length: TOTAL_USERS }, (_, i) => makeUser(i));
  const users = await mapLimit(rawUsers, CONCURRENCY, async (candidate, index) => {
    const signup = await request("/user/signup", { method: "POST", body: JSON.stringify(candidate) });
    const user = { ...signup.data, token: signup.token, requestedPlan: desiredPlan(index), about: candidate.about, tags: candidate.tags, level: candidate.level };
    await request(`/user/update/${user._id}`, {
      method: "PATCH",
      headers: authHeader(user),
      body: JSON.stringify({ editForm: { name: user.name, about: user.about, tags: user.tags } }),
    });
    stats.users += 1;
    return user;
  });
  logProgress("users-created");

  const premiumUsers = users.filter((u) => u.requestedPlan !== "free");
  await mapLimit(premiumUsers, 10, async (user) => activatePremium(user, user.requestedPlan));
  logProgress("premium-activated");

  const authorSlots = [];
  for (const user of users) {
    const limit = planLimits[user.plan || user.requestedPlan || "free"] || 1;
    const count = limit === Infinity ? TOTAL_QUESTIONS : limit;
    for (let i = 0; i < count && authorSlots.length < TOTAL_QUESTIONS; i += 1) authorSlots.push(user);
  }
  while (authorSlots.length < TOTAL_QUESTIONS) {
    const gold = users.find((u) => u.plan === "gold");
    if (!gold) throw new Error("Not enough premium capacity to create requested questions");
    authorSlots.push(gold);
  }

  const questions = await mapLimit(Array.from({ length: TOTAL_QUESTIONS }, (_, i) => i), CONCURRENCY, async (index) => {
    const author = authorSlots[index];
    const res = await request("/question/ask", {
      method: "POST",
      headers: authHeader(author),
      body: JSON.stringify(questionPayload(index, author)),
    });
    stats.questions += 1;
    return res.data;
  });
  logProgress("questions-created");

  const answerTasks = questions.filter(() => Math.random() < 0.7).flatMap((q) => {
    const count = rand(1, 5);
    return Array.from({ length: count }, (_, i) => ({ q, i, answerer: choice(users) }));
  });
  await mapLimit(answerTasks, CONCURRENCY, async ({ q, i, answerer }) => {
    await request(`/answer/postanswer/${q._id}`, {
      method: "POST",
      headers: authHeader(answerer),
      body: JSON.stringify({ noofanswer: q.noofanswer || 0, answerbody: answerBody(q, i), useranswered: answerer.name, userid: answerer._id }),
    });
    stats.answers += 1;
  });
  logProgress("answers-created");

  const voteTasks = questions.flatMap((q) => sample(users, rand(2, 10)).map((voter) => ({ q, voter, value: Math.random() < 0.84 ? "upvote" : "downvote" })));
  await mapLimit(voteTasks, CONCURRENCY, async ({ q, voter, value }) => {
    await request(`/question/vote/${q._id}`, {
      method: "PATCH",
      headers: authHeader(voter),
      body: JSON.stringify({ value, userid: voter._id }),
    });
    stats.votes += 1;
  });
  logProgress("votes-created");

  const bookmarkUsers = users.filter((u) => ["silver", "gold"].includes(u.plan));
  const bookmarkTasks = questions.filter(() => Math.random() < 0.25).map((q) => ({ q, user: choice(bookmarkUsers) })).filter((x) => x.user);
  await mapLimit(bookmarkTasks, CONCURRENCY, async ({ q, user }) => {
    await request(`/question/bookmark/${q._id}`, { method: "PATCH", headers: authHeader(user) });
    stats.bookmarks += 1;
  });

  clearInterval(timer);
  const report = {
    usersCreated: stats.users,
    questionsCreated: stats.questions,
    answersCreated: stats.answers,
    commentsCreated: stats.comments,
    votesCreated: stats.votes,
    bookmarksCreated: stats.bookmarks,
    subscriptionsCreated: stats.subscriptions,
    unsupported,
    failedRequests: failures.length,
    failures: failures.slice(0, 50),
    executionTimeSeconds: Math.round((Date.now() - started) / 1000),
  };
  console.log(`FINAL_REPORT ${JSON.stringify(report, null, 2)}`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("SEED_FATAL", error);
  console.log(`FINAL_REPORT ${JSON.stringify({ ...stats, failedRequests: failures.length, failures, unsupported }, null, 2)}`);
  process.exit(1);
});
