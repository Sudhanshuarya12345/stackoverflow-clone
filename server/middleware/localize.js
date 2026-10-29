import { normalizeLanguage, translateMessage } from "../i18n/index.js";

// Reads the language the frontend is displaying (X-Language header) and translates the `message` of every JSON
// response into it, so validation errors, limits and confirmations match the rest of the page. Runs for English
// too, so raw internal error text on a 5xx response is replaced by the generic error.
export default function localize(req, res, next) {
  req.language = normalizeLanguage(req.headers["x-language"]);
  const json = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === "object" && typeof body.message === "string") {
      body = { ...body, message: translateMessage(body.message, req.language, res.statusCode) };
    }
    return json(body);
  };
  next();
}
