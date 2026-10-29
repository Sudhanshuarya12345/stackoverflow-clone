import { Html, Head, Main, NextScript } from "next/document";

// Pages are prerendered, so the HTML is served with lang="en". This runs before the first paint and applies the
// signed-in user's language (stored with the session by AuthContext), so screen readers, browser translation and
// font selection see the right language from the start. I18nProvider keeps it in sync afterwards.
const setLanguageBeforePaint = `(function () {
  try {
    var user = JSON.parse(localStorage.getItem("user") || "null");
    var lang = user && user.language;
    if (["en", "es", "hi", "pt", "zh", "fr"].indexOf(lang) !== -1) document.documentElement.lang = lang;
  } catch (e) {}
})();`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: setLanguageBeforePaint }} />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
