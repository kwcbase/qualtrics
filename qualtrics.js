(function () {
  var SIE_URL = "https://zn2ukynhmxdi4ug6f-krogerxmit.siteintercept.qualtrics.com/SIE/?Q_ZID=ZN_2uKyNHmXdi4UG6f";
  var ROOT_ID = "qualtrics-intercept-root";
  var ZONE_ID = "ZN_2uKyNHmXdi4UG6f";
  var COOKIE_NAME = "kroger_personnumber";
  var STAFFBASE_USERS_DETAILS = "https://mycart-stg.kroger.com/api/users/me";

  // In-app survey pop-up. Qualtrics intercepts don't render inside the Staffbase app,
  // so in the app we show our own modal and use Qualtrics only to host the survey.
  var SURVEY_ID = "SV_8207NCK60jdakho"; // same survey the web intercept SI_emTS87kwARkdqt0 targets
  var SURVEY_URL = "https://krogerxmit.iad1.qualtrics.com/jfe/form/" + SURVEY_ID; // anonymous survey link
  var SURVEY_PERSON_PARAM = "personnumber"; // must match the embedded data field name in the survey flow
  var SURVEY_SEEN_KEY = "kroger_survey_seen_" + SURVEY_ID;

  function ensureRoot() {
    var el = document.getElementById(ROOT_ID);

    if (!el) {
      el = document.createElement("div");
      el.id = ROOT_ID;
      el.style.display = "none";
      document.body.appendChild(el);
    }

    return el;
  }

  function ensureZoneDiv() {
    if (!document.getElementById(ZONE_ID)) {
      var div = document.createElement("div");
      div.id = ZONE_ID;
      document.body.appendChild(div);
    }
  }

  function setCookie(name, value, days) {
    var maxAge = days * 24 * 60 * 60;

    document.cookie =
      encodeURIComponent(name) + "=" + encodeURIComponent(value) +
      "; Max-Age=" + maxAge +
      "; Path=/" +
      "; SameSite=Lax" +
      "; Secure";
  }

  function getCookie(name) {
    var cookieName = encodeURIComponent(name) + "=";
    var cookies = document.cookie.split(";");

    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();

      if (cookie.indexOf(cookieName) === 0) {
        return decodeURIComponent(cookie.substring(cookieName.length));
      }
    }

    return null;
  }

  // Get user's Kroger person number from Staffbase API
  function getUserId() {
    return fetch(STAFFBASE_USERS_DETAILS, { credentials: "include" })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("User fetch failed: " + res.status);
        }

        return res.json();
      })
      .then(function (data) {
        // Primary: personnumber
        var extRef = data.profile && data.profile.personnumber
          ? data.profile.personnumber
          : null;

        console.log("[Qualtrics] externalReference resolved:", extRef);

        // Store personnumber in browser cookie
        if (extRef) {
          setCookie(COOKIE_NAME, extRef, 30);
          console.log("[Qualtrics] personnumber stored in cookie:", extRef);
        }

        return extRef;
      })
      .catch(function (err) {
        console.warn("[Qualtrics] Could not fetch user ID:", err);
        console.warn("QUAL ERROR", err.Error);
        console.log(STAFFBASE_USERS_DETAILS)
        // Optional fallback: use existing cookie if API fails
        var existingPersonNumber = getCookie(COOKIE_NAME);

        if (existingPersonNumber) {
          console.log("[Qualtrics] Using personnumber from cookie:", existingPersonNumber);
          return existingPersonNumber;
        }

        return null;
      });
  }

  function loadQualtrics(extRef) {
    ensureRoot();
    ensureZoneDiv();

    window.QSI = window.QSI || {};
    window.QSI.config = window.QSI.config || {};

    console.log("Extref 1:", extRef);

    if (extRef) {
      console.log("Extref 2:", extRef);
      window.QSI.config.externalReference = extRef;
    }

    // If already loaded, just re-run
    if (
      window.QSI &&
      window.QSI.API &&
      typeof window.QSI.API.run === "function"
    ) {
      try {
        if (window.QSI.API.unload) {
          window.QSI.API.unload();
        }

        if (window.QSI.API.load) {
          window.QSI.API.load();
        }

        window.QSI.API.run();
      } catch (e) {
        console.warn("[Qualtrics] QSI run failed:", e);
      }

      return;
    }

    // Otherwise load the SIE script
    if (!document.querySelector("script[src='" + SIE_URL + "']")) {
      var script = document.createElement("script");
      script.type = "text/javascript";
      script.src = SIE_URL;
      script.async = true;

      script.onload = function () {
        if (window.QSI && window.QSI.API) {
          try {
            if (window.QSI.API.load) {
              window.QSI.API.load();
            }

            if (window.QSI.API.run) {
              window.QSI.API.run();
            }
          } catch (e) {
            console.warn("[Qualtrics] QSI init failed:", e);
          }
        }
      };

      document.body.appendChild(script);
    }
  }

  // SPA navigation handling because Staffbase is a Single Page App
  function hookSPANavigation() {
    var lastUrl = location.href;

    ["pushState", "replaceState"].forEach(function (type) {
      var orig = history[type];

      history[type] = function () {
        var result = orig.apply(this, arguments);
        window.dispatchEvent(new Event("qsi:locationchange"));
        return result;
      };
    });

    window.addEventListener("popstate", function () {
      window.dispatchEvent(new Event("qsi:locationchange"));
    });

    window.addEventListener("qsi:locationchange", function () {
      if (location.href !== lastUrl) {
        lastUrl = location.href;

        if (
          window.QSI &&
          window.QSI.API &&
          typeof window.QSI.API.run === "function"
        ) {
          try {
            window.QSI.API.run();
          } catch (e) {
            console.warn("[Qualtrics] QSI SPA run failed:", e);
          }
        }
      }
    });
  }

  // ---- In-app survey pop-up ----

  // The Staffbase iOS app serves pages from capacitor://. Android is not covered by this check (untested).
  function isInApp() {
    return location.protocol === "capacitor:";
  }

  // localStorage, not cookies: cookies don't persist inside the app.
  function surveyAlreadySeen() {
    try {
      return localStorage.getItem(SURVEY_SEEN_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markSurveySeen() {
    try {
      localStorage.setItem(SURVEY_SEEN_KEY, "1");
    } catch (e) {}
  }

  function buildSurveyUrl(personNumber) {
    return SURVEY_URL +
      (SURVEY_URL.indexOf("?") === -1 ? "?" : "&") +
      encodeURIComponent(SURVEY_PERSON_PARAM) + "=" + encodeURIComponent(personNumber);
  }

  function showSurveyModal(surveyUrl) {
    var previousOverflow = document.body.style.overflow;

    var overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Survey");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);" +
      "display:flex;align-items:center;justify-content:center";

    var box = document.createElement("div");
    box.style.cssText =
      "display:flex;flex-direction:column;width:92vw;max-width:600px;height:80vh;" +
      "background:#fff;border-radius:12px;overflow:hidden";

    var header = document.createElement("div");
    header.style.cssText =
      "display:flex;justify-content:space-between;align-items:center;padding:8px 12px;" +
      "border-bottom:1px solid #e5e5e5;font:14px -apple-system,system-ui,sans-serif";

    // Fallback if the survey can't be shown inside the frame. What target=_blank does in the app is untested.
    var openLink = document.createElement("a");
    openLink.href = surveyUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener";
    openLink.textContent = "Open in browser";

    var close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close survey");
    close.style.cssText =
      "font-size:28px;line-height:1;background:none;border:0;padding:4px 8px;cursor:pointer";
    close.onclick = function () {
      overlay.remove();
      document.body.style.overflow = previousOverflow;
    };

    var frame = document.createElement("iframe");
    frame.src = surveyUrl;
    frame.title = "Survey";
    frame.style.cssText = "flex:1;width:100%;border:0";

    header.appendChild(openLink);
    header.appendChild(close);
    box.appendChild(header);
    box.appendChild(frame);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
  }

  function initInAppSurvey() {
    if (surveyAlreadySeen()) {
      return;
    }

    getUserId().then(function (personNumber) {
      // Without a person number the response can't be attributed. Skip without
      // marking as seen so it tries again on the next app open.
      if (!personNumber) {
        return;
      }

      // Marked on show, not on completion: simpler, and avoids re-prompting people who closed it.
      markSurveySeen();
      showSurveyModal(buildSurveyUrl(personNumber));
    });
  }

  function init() {
    if (isInApp()) {
      initInAppSurvey();
      return;
    }

    getUserId().then(function (extRef) {
      loadQualtrics(extRef);
      hookSPANavigation();
    });
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    window.addEventListener("DOMContentLoaded", init, false);
  }
})();