// Public, unauthenticated share page for the "Invite a friend" link in
// notification emails (added August 27). A plain <a href> in an email
// can't trigger the Web Share API directly -- that requires a page and a
// user gesture on that page -- so this serves a minimal standalone page
// with a Share button, calling navigator.share() the same way the in-app
// Profile > Invite friends button does (shareApp() in src/utils/share.ts),
// reusing its exact blurb text for consistency. On a real mobile device
// this opens the native OS share sheet (AirDrop, Messages, WhatsApp, and
// whatever else is installed, rendered by the OS itself, not by this
// page); desktop browsers without Web Share API support fall back to
// copy-to-clipboard.
//
// This is a second unauthenticated surface, alongside item-preview, which
// documents itself as "intentionally the only" one (PRD §3). Deliberate,
// acknowledged exception approved for this feature specifically, not an
// oversight.

const APP_URL = "https://letsbarter.app";
const SHARE_TEXT = "Been decluttering with Barter lately, trading instead of tossing things out. Worth a look:";

function renderPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Share Barter</title>
</head>
<body style="margin:0; padding:0; background-color:#FDFCF7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width:480px; margin:40px auto; padding:0 16px;">
    <div style="background-color:#ffffff; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.06); padding:40px 32px; text-align:center;">
      <div style="font-size:22px; font-weight:800; color:#1D5B2B; letter-spacing:-0.02em; margin-bottom:24px;">Barter</div>
      <h1 style="margin:0 0 12px 0; font-size:20px; font-weight:800; color:#1a1a1a;">Share Barter with a friend</h1>
      <p style="margin:0 0 32px 0; font-size:14px; line-height:1.6; color:#4b5563;">Barter works best with more people trading nearby.</p>
      <button id="share-btn" style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:700; color:#ffffff; background-color:#1D5B2B; border:none; border-radius:12px; cursor:pointer;">Share</button>
      <p id="fallback-msg" style="display:none; margin:16px 0 0 0; font-size:13px; color:#71717a;"></p>
    </div>
  </div>
  <script>
    var shareText = ${JSON.stringify(SHARE_TEXT)};
    var appUrl = ${JSON.stringify(APP_URL)};
    document.getElementById('share-btn').addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: 'Barter', text: shareText, url: appUrl }).catch(function (err) {
          if (err && err.name !== 'AbortError') {
            showFallback('Could not open the share sheet.');
          }
        });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText + '\\n' + appUrl).then(function () {
          showFallback('Link copied to clipboard.');
        }).catch(function () {
          showFallback('Could not copy the link. Copy it manually: ' + appUrl);
        });
      } else {
        showFallback('Copy this link: ' + appUrl);
      }
    });
    function showFallback(msg) {
      var el = document.getElementById('fallback-msg');
      el.textContent = msg;
      el.style.display = 'block';
    }
  </script>
</body>
</html>`;
}

Deno.serve(async (_req: Request) => {
  return new Response(renderPage(), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
});
