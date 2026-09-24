import Notification from "../models/Notification.js";

const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(25, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, skip: (page - 1) * limit };
};

export const getNotifications = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const [data, total] = await Promise.all([
      Notification.find({ recipient: req.userid })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("actor", "name plan")
        .populate("postId", "content type status")
        .lean(),
      Notification.countDocuments({ recipient: req.userid }),
    ]);
    res.status(200).json({ data, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load notifications" });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.userid, read: false });
    res.status(200).json({ count });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load notification count" });
  }
};

export const markRead = async (req, res) => {
  try {
    await Notification.updateOne({ _id: req.params.id, recipient: req.userid }, { read: true });
    res.status(200).json({ message: "Notification marked read" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not update notification" });
  }
};

export const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.userid, read: false }, { read: true });
    res.status(200).json({ message: "Notifications marked read" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not update notifications" });
  }
};
