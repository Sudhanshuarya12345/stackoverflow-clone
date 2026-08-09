import mongoose from "mongoose";
import question from "../models/question.js";

export const Askanswer = async (req, res) => {
  const { id: _id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "question unavailable" });
  }
  const { answerbody, useranswered, userid } = req.body;

  try {
    const updatequestion = await question.findByIdAndUpdate(
      _id,
      {
        $push: { answer: { answerbody, useranswered, userid } },
        $inc: { noofanswer: 1 },
      },
      { new: true }
    );
    res.status(200).json({ data: updatequestion });
  } catch (error) {
    console.log(error);
    res.status(500).json("something went wrong..");
    return;
  }
};
export const deleteanswer = async (req, res) => {
  const { id: _id } = req.params;
  const { answerid } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "question unavailable" });
  }
  if (!mongoose.Types.ObjectId.isValid(answerid)) {
    return res.status(400).json({ message: "answer unavailable" });
  }
  try {
    const updatequestion = await question.findOneAndUpdate(
      { _id, "answer._id": answerid },
      {
        $pull: { answer: { _id: answerid } },
        $inc: { noofanswer: -1 },
      },
      { new: true }
    );
    if (!updatequestion) return res.status(404).json({ message: "Answer not found" });
    res.status(200).json({ data: updatequestion });
  } catch (error) {
    console.log(error);
    res.status(500).json("something went wrong..");
    return;
  }
};
