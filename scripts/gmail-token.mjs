/**
 * One-off helper: get a Gmail API refresh token for the account that sends
 * CirKit's invitation emails.
 *
 *   npm run gmail:token
 *
 * Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env (an OAuth client of
 * type "Desktop app"). It opens Google's consent page; sign in as the sender
 * account and allow "Send email on your behalf". The refresh token is printed
 * here; paste it into .env as GMAIL_REFRESH_TOKEN. Never commit it.
 *
 * While the Google app is in "Testing" mode the token expires after 7 days;
 * just run this again.
 */
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";

const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const clientId = process.env.GMAIL_CLIENT_ID?.trim();
const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.");
  process.exit(1);
}

// PKCE + state: the code can only be redeemed by this process, and the
// callback must come from the request we started.
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const state = randomBytes(16).toString("base64url");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const finish = (status, message) => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" }).end(message);
    server.close();
  };

  if (url.searchParams.get("state") !== state) return finish(400, "State mismatch. Run the script again.");
  const error = url.searchParams.get("error");
  if (error) {
    console.error(`Google returned an error: ${error}`);
    return finish(400, `Google returned an error: ${error}. You can close this tab.`);
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: url.searchParams.get("code") ?? "",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    const tokens = await response.json();
    if (!response.ok) throw new Error(tokens.error_description ?? tokens.error ?? response.statusText);
    if (!tokens.refresh_token) {
      throw new Error(
        "Google didn't return a refresh token. Remove CirKit's access at " +
          "https://myaccount.google.com/permissions and run this again.",
      );
    }
    if (!String(tokens.scope ?? "").includes(SCOPE)) {
      throw new Error("The gmail.send permission wasn't granted. Run again and tick it.");
    }
    console.log("\nSuccess. Add this line to .env (and keep it secret):\n");
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log("Also set GMAIL_SENDER to the address you just signed in with.\n");
    finish(200, "Done. Return to the terminal; you can close this tab.");
  } catch (err) {
    console.error(`\nFailed: ${err instanceof Error ? err.message : err}`);
    finish(500, "Something went wrong; see the terminal.");
  }
});

let redirectUri = "";
server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  redirectUri = `http://127.0.0.1:${port}/callback`;
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline", // ask for a refresh token
      prompt: "consent", // ...every time, even if allowed before
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
  console.log("Opening Google sign-in. Sign in as the SENDER account.\n");
  console.log(`If no browser opens, visit:\n${authUrl}\n`);
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  execFile(opener, [authUrl], () => {});
});
