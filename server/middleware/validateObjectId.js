import mongoose from "mongoose";

// router.param handler: rejects malformed ids with 400 instead of letting Mongoose throw a CastError (500).
const validateObjectId = (req, res, next, value, name) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return res.status(400).json({ message: `Invalid ${name}` });
  }
  next();
};

export default validateObjectId;
