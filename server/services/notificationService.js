import Notification from "../models/Notification.js";
import User from "../models/auth.js";

export const extractHashtags = (text = "") => {
  const matches = text.match(/#[a-zA-Z0-9_]{2,40}/g) || [];
  return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
};

const MAX_MENTION_WORDS = 4;

// "@Jane Doe nice work" could mean "Jane" or "Jane Doe", so every 1-4 word prefix after the @ is a candidate
// display name. Names are matched case-insensitively.
export const findMentionedUsers = async (text = "") => {
  const candidates = new Set();
  for (const match of String(text).matchAll(/@([a-zA-Z0-9_.-]+(?: [a-zA-Z0-9_.-]+){0,3})/g)) {
    const words = match[1].split(" ");
    for (let i = 1; i <= Math.min(words.length, MAX_MENTION_WORDS); i++) {
      const name = words.slice(0, i).join(" ").replace(/[.,!?;:]+$/, "");
      if (name.length >= 2 && name.length <= 40) candidates.add(name);
    }
  }
  if (!candidates.size) return [];
  return User.find({ name: { $in: [...candidates] } })
    .collation({ locale: "en", strength: 2 })
    .select("_id name")
    .lean();
};

// Toggle-style actions should not notify again every time they are repeated (like, unlike, like again).
const ONCE_PER_TARGET = ["like", "follow", "share", "mention"];

export const notify = async ({ recipient, actor, type, postId }) => {
  if (!recipient || !actor || String(recipient) === String(actor)) return;
  if (ONCE_PER_TARGET.includes(type)) {
    await Notification.updateOne(
      { recipient, actor, type, postId: postId || null },
      { $setOnInsert: { recipient, actor, type, postId } },
      { upsert: true }
    );
    return;
  }
  await Notification.create({ recipient, actor, type, postId });
};

export const notifyMentions = async ({ users, actor, postId }) => {
  await Promise.all(users.map((u) => notify({ recipient: u._id, actor, type: "mention", postId })));
};
