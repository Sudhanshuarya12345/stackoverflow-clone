import mongoose from "mongoose";

const questionschema = mongoose.Schema(
  {
    questiontitle: { type: String, required: true },
    questionbody: { type: String, required: true },
    questiontags: { type: [String], required: true },
    noofanswer: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    favorites: { type: [String], default: [] },
    acceptedAnswerId: { type: String },
    upvoteMilestoneAwarded: { type: Boolean, default: false },
    closeVotes: { type: [String], default: [] },
    closed: { type: Boolean, default: false },
    closedAt: { type: Date },
    bounty: {
      amount: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ["none", "active", "awarded", "expired"],
        default: "none",
      },
      startedBy: String,
      startedAt: Date,
      expiresAt: Date,
      awardedToAnswerId: String,
      awardedToUserId: String,
      awardedAt: Date,
    },
    comments: [
      {
        body: String,
        usercommented: String,
        userid: String,
        commentedon: { type: Date, default: Date.now },
      },
    ],
    upvote: { type: [String], default: [] },
    downvote: { type: [String], default: [] },
    userposted: { type: String },
    userid: { type: String },
    askedon: { type: Date, default: Date.now },
    answer: [
      {
        answerbody: String,
        useranswered: String,
        userid: String,
        answeredon: { type: Date, default: Date.now },
        isAccepted: { type: Boolean, default: false },
        upvote: { type: [String], default: [] },
        downvote: { type: [String], default: [] },
        upvoteMilestoneAwarded: { type: Boolean, default: false },
        comments: [
          {
            body: String,
            usercommented: String,
            userid: String,
            commentedon: { type: Date, default: Date.now },
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

questionschema.index({ questiontitle: "text", questionbody: "text", questiontags: "text" });
export default mongoose.model("question", questionschema);
