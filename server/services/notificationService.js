import Notification from "../models/Notification.js";
import User from "../models/auth.js";

export const extractHashtags = (text = "") => {
  const matches = text.match(/#[a-zA-Z0-9_]{2,40}/g) || [];
  return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
};

export const findMentionedUsers = async (text = "") => {
  const matches = text.match(/@[a-zA-Z0-9_ .-]{2,40}/g) || [];
  const names = [...new Set(matches.map((name) => name.slice(1).trim()).filter(Boolean))];
  if (!names.length) return [];
  return User.find({ name: { $in: names } }).select("_id name").lean();
};

export const notify = async ({ recipient, actor, type, postId }) => {
  if (!recipient || !actor || String(recipient) === String(actor)) return;
  await Notification.create({ recipient, actor, type, postId });
};

export const notifyMentions = async ({ users, actor, postId }) => {
  await Promise.all(users.map((u) => notify({ recipient: u._id, actor, type: "mention", postId })));
};
