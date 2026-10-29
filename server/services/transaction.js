import mongoose from "mongoose";

// Runs `work(session)` in a MongoDB transaction: every write made with the session commits together or not at
// all. withTransaction re-runs the whole callback on transient errors such as write conflicts between two
// concurrent requests, so `work` must only touch the database (do emails, uploads, badges after it returns).
export const runInTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

// Thrown inside a transaction to roll back writes already made and answer the request with a client error.
export const abortWith = (status, message) => Object.assign(new Error(message), { status, aborted: true });
