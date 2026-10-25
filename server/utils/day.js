// Calendar-day key (YYYY-MM-DD) used by every "per day" limit. Days roll over at midnight in APP_TIMEZONE
// (default India), not UTC, so a user's daily allowance resets at their local midnight.
export const todayKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
