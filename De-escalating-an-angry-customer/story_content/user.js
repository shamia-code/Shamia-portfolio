window.InitUserScripts = function()
{
var player = GetPlayer();
var object = player.object;
var once = player.once;
var addToTimeline = player.addToTimeline;
var setVar = player.SetVar;
var getVar = player.GetVar;
var update = player.update;
var pointerX = player.pointerX;
var pointerY = player.pointerY;
var showPointer = player.showPointer;
var hidePointer = player.hidePointer;
var slideWidth = player.slideWidth;
var slideHeight = player.slideHeight;
window.Script1 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script2 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script3 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script4 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script5 = function()
{
  window.lockCourseProgress(10);
}

window.Script6 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script7 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script8 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script9 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script10 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script11 = function()
{
  window.lockCourseProgress(10);
}

window.Script12 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script13 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script14 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script15 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script16 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script17 = function()
{
  window.lockCourseProgress(10);
}

window.Script18 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script19 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script20 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script21 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script22 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script23 = function()
{
  window.lockCourseProgress(10);
}

window.Script24 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script25 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script26 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script27 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script28 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script29 = function()
{
  window.lockCourseProgress(10);
}

window.Script30 = function()
{
  const player = GetPlayer();

let muted = player.GetVar("Muted");

if (muted) {
    DS.appState.setVolume(1);
    player.SetVar("Muted", false);
} else {
    DS.appState.setVolume(0);
    player.SetVar("Muted", true);
} 
}

window.Script31 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script32 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script33 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script34 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script35 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script36 = function()
{
  window.lockCourseProgress(10);
}

window.Script37 = function()
{
  const player = GetPlayer();

let muted = player.GetVar("Muted");

if (muted) {
    DS.appState.setVolume(1);
    player.SetVar("Muted", false);
} else {
    DS.appState.setVolume(0);
    player.SetVar("Muted", true);
} 
}

window.Script38 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script39 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script40 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script41 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script42 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script43 = function()
{
  window.lockCourseProgress(10);
}

window.Script44 = function()
{
  const player = GetPlayer();

let muted = player.GetVar("Muted");

if (muted) {
    DS.appState.setVolume(1);
    player.SetVar("Muted", false);
} else {
    DS.appState.setVolume(0);
    player.SetVar("Muted", true);
} 
}

window.Script45 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script46 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script47 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script48 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script49 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script50 = function()
{
  window.lockCourseProgress(10);
}

window.Script51 = function()
{
  const player = GetPlayer();

let muted = player.GetVar("Muted");

if (muted) {
    DS.appState.setVolume(1);
    player.SetVar("Muted", false);
} else {
    DS.appState.setVolume(0);
    player.SetVar("Muted", true);
} 
}

window.Script52 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script53 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script54 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script55 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script56 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script57 = function()
{
  window.lockCourseProgress(10);
}

window.Script58 = function()
{
  const player = GetPlayer();

let muted = player.GetVar("Muted");

if (muted) {
    DS.appState.setVolume(1);
    player.SetVar("Muted", false);
} else {
    DS.appState.setVolume(0);
    player.SetVar("Muted", true);
} 
}

window.Script59 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script60 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script61 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script62 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script63 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script64 = function()
{
  window.lockCourseProgress(10);
}

window.Script65 = function()
{
  const player = GetPlayer();

let muted = player.GetVar("Muted");

if (muted) {
    DS.appState.setVolume(1);
    player.SetVar("Muted", false);
} else {
    DS.appState.setVolume(0);
    player.SetVar("Muted", true);
} 
}

window.Script66 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script67 = function()
{
  var player = GetPlayer();
var response = player.GetVar("d5_response");
var text = response.toLowerCase();

var keywords = ["confirm", "email", "number"];
var hasSpecifics = keywords.some(function(keyword) {
  return text.indexOf(keyword) !== -1;
});

player.SetVar("d5_hasSpecifics", hasSpecifics);
}

window.Script68 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script69 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script70 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script71 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script72 = function()
{
  window.lockCourseProgress(10);
}

window.Script73 = function()
{
  const player = GetPlayer();

let muted = player.GetVar("Muted");

if (muted) {
    DS.appState.setVolume(1);
    player.SetVar("Muted", false);
} else {
    DS.appState.setVolume(0);
    player.SetVar("Muted", true);
} 
}

window.Script74 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script75 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script76 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script77 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script78 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script79 = function()
{
  window.lockCourseProgress(10);
}

window.Script80 = function()
{
  const player = GetPlayer();

let muted = player.GetVar("Muted");

if (muted) {
    DS.appState.setVolume(1);
    player.SetVar("Muted", false);
} else {
    DS.appState.setVolume(0);
    player.SetVar("Muted", true);
} 
}

window.Script81 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script82 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script83 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script84 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script85 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script86 = function()
{
  window.lockCourseProgress(10);
}

window.Script87 = function()
{
  const player = GetPlayer();

let muted = player.GetVar("Muted");

if (muted) {
    DS.appState.setVolume(1);
    player.SetVar("Muted", false);
} else {
    DS.appState.setVolume(0);
    player.SetVar("Muted", true);
} 
}

window.Script88 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script89 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script90 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script91 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script92 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script93 = function()
{
  window.lockCourseProgress(10);
}

window.Script94 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

window.Script95 = function()
{
  // Function to minimize menu when entering full screen mode
(function () {
  if (window._slSidebarCtl && window._slSidebarCtl._initialized) return;

  function getBtn() {
    return document.querySelector('button#hamburger[aria-controls="sidebar"]');
  }
  function isExpanded() {
    var b = getBtn(); if (!b) return null;
    return b.getAttribute('aria-expanded') === 'true'; // true => panel visible
  }
  function clickToCollapse() { var b = getBtn(); if (b && isExpanded() === true) b.click(); }
  function clickToExpand()   { var b = getBtn(); if (b && isExpanded() === false) b.click(); }

  function waitForBtn(cb, maxMs) {
    var waited = 0, step = 50, max = maxMs || 8000;
    var t = setInterval(function(){
      if (getBtn()) { clearInterval(t); cb(); }
      else if ((waited += step) >= max) { clearInterval(t); }
    }, step);
  }

  function readFullScreen() {
    try {
      var v = GetPlayer().GetVar('FS');
      // Normalize possible representations to boolean
      return (v === true || v === 1 || v === 'true' || v === 'True');
    } catch(e){ return false; }
  }

  var ctl = window._slSidebarCtl || {};
  ctl._initialized = true;

  // State bookkeeping
  ctl.preFS = null;          // sidebar state before entering FS
  ctl.changedInFS = false;   // did user change sidebar while in FS?
  ctl.lastKnown = null;      // last known sidebar state during FS
  ctl.inFS = false;

  // Observe aria-expanded while in FS so we detect user changes
  ctl._obs = null;
  function attachObserver() {
    detachObserver();
    var b = getBtn(); if (!b) return;
    ctl._obs = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.attributeName === 'aria-expanded' && ctl.inFS) {
          ctl.changedInFS = true;
          ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
        }
      });
    });
    ctl._obs.observe(b, { attributes: true, attributeFilter: ['aria-expanded'] });
    b.addEventListener('click', function(){
      if (ctl.inFS) {
        ctl.changedInFS = true;
        ctl.lastKnown = (b.getAttribute('aria-expanded') === 'true');
      }
    }, { passive:true });
  }
  function detachObserver() { if (ctl._obs) { ctl._obs.disconnect(); ctl._obs = null; } }

  function enterFS() {
    ctl.inFS = true;
    waitForBtn(function () {
      ctl.preFS = isExpanded();
      ctl.lastKnown = ctl.preFS;
      ctl.changedInFS = false;
      clickToCollapse();     // provide a clean fullscreen
      attachObserver();      // track user changes during FS
    });
  }
  function exitFS() {
    ctl.inFS = false;
    detachObserver();
    waitForBtn(function () {
      if (ctl.changedInFS) {
        // Respect how they left it in FS
        if (ctl.lastKnown === true) clickToExpand(); else clickToCollapse();
      } else {
        // Restore pre-FS state
        if (ctl.preFS === true) clickToExpand(); else clickToCollapse();
      }
    });
  }

  ctl.onFSChange = function(isFS) { isFS ? enterFS() : exitFS(); };

  // If slide starts already in fullscreen, apply immediately
  try { if (readFullScreen()) ctl.onFSChange(true); } catch(e){}

  window._slSidebarCtl = ctl;
})();

}

window.Script96 = function()
{
  /* =========================================================
   RESPONSIVE BRANCH-AWARE STORYLINE PROGRESS BAR

   Storyline variable:
   ProgressCurrent

   Total screens along one learner route:
   30
========================================================= */

(function () {
    /* =========================
       SETTINGS
    ========================= */

    const progressVariable = "ProgressCurrent";
    const totalScreens = 30;

    const bgColour = "#F6F9FB";
    const barColour = "#FCCE4B";
    const completedColour = "#19BB32";
    const borderRadius = "100px";

    const barWidthRatio = 0.25;
    const leftPositionRatio = 0.02;
    const bottomPositionRatio = 0;

    const minimumBarWidth = 140;
    const maximumBarWidth = 280;

    const minimumBarHeight = 4;
    const maximumBarHeight = 8;

    const updateInterval = 50;

    /* =========================
       CLEAN UP PREVIOUS SCRIPT
    ========================= */

    if (window.__courseProgressController) {
        window.__courseProgressController.destroy();
    }

    /* =========================
       GET STORYLINE PLAYER
    ========================= */

    let player;

    try {
        player = GetPlayer();
    } catch (error) {
        console.error(
            "Could not access the Storyline player.",
            error
        );
        return;
    }

    /* =========================
       INTERNAL VARIABLES
    ========================= */

    let activeSlide = null;
    let progressWrapper = null;
    let progressTrack = null;
    let progressFill = null;

    let previousProgressValue = null;

    let progressTimer = null;
    let resizeObserver = null;
    let mutationObserver = null;

    /* =========================
       HELPER FUNCTIONS
    ========================= */

    function clamp(value, minimum, maximum) {
        return Math.max(
            minimum,
            Math.min(maximum, value)
        );
    }

    /*
       Determines whether an element is currently visible.
    */
    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /*
       Finds the currently visible Storyline slide.

       Storyline can temporarily keep more than one slide
       container in the DOM during transitions.
    */
    function findActiveSlide() {
        const selectors = [
            '[data-ref="slide"]',
            ".slide-container",
            "#slide",
            ".slide",
            "#slide-window",
            ".slide-window"
        ];

        const candidates = [];

        selectors.forEach(function (selector) {
            document
                .querySelectorAll(selector)
                .forEach(function (element) {
                    if (
                        !candidates.includes(element)
                    ) {
                        candidates.push(element);
                    }
                });
        });

        /*
           Prefer visible elements with the largest area.
           The active Storyline slide is normally the largest
           visible matching container.
        */
        const visibleCandidates =
            candidates
                .filter(isVisible)
                .map(function (element) {
                    const rect =
                        element.getBoundingClientRect();

                    return {
                        element: element,
                        area:
                            rect.width *
                            rect.height
                    };
                })
                .sort(function (a, b) {
                    return b.area - a.area;
                });

        if (visibleCandidates.length > 0) {
            return visibleCandidates[0].element;
        }

        return null;
    }

    function getProgressValue() {
        let current = 0;

        try {
            current = Number(
                player.GetVar(progressVariable)
            );
        } catch (error) {
            console.warn(
                `Could not read "${progressVariable}".`,
                error
            );
        }

        if (!Number.isFinite(current)) {
            current = 0;
        }

        return clamp(
            current,
            0,
            totalScreens
        );
    }

    function getPercentage(current) {
        if (totalScreens <= 0) {
            return 0;
        }

        return clamp(
            (current / totalScreens) * 100,
            0,
            100
        );
    }

    /* =========================
       REMOVE STALE BARS
    ========================= */

    function removeStaleProgressBars() {
        document
            .querySelectorAll(
                '[data-course-progress-bar="true"]'
            )
            .forEach(function (element) {
                /*
                   Keep only the bar attached to the
                   current active slide.
                */
                if (
                    !activeSlide ||
                    !activeSlide.contains(element)
                ) {
                    element.remove();
                }
            });
    }

    /* =========================
       CREATE PROGRESS BAR
    ========================= */

    function createProgressBar(slide) {
        if (!slide) {
            return;
        }

        const computedPosition =
            window.getComputedStyle(slide).position;

        if (computedPosition === "static") {
            slide.style.position = "relative";
        }

        /*
           Do not use document.getElementById() here.
           Storyline may temporarily retain duplicate slide DOM.
        */
        progressWrapper =
            slide.querySelector(
                '[data-course-progress-bar="true"]'
            );

        if (progressWrapper) {
            progressTrack =
                progressWrapper.querySelector(
                    '[data-progress-track="true"]'
                );

            progressFill =
                progressWrapper.querySelector(
                    '[data-progress-fill="true"]'
                );

            return;
        }

        progressWrapper =
            document.createElement("div");

        progressWrapper.setAttribute(
            "data-course-progress-bar",
            "true"
        );

        Object.assign(
            progressWrapper.style,
            {
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                zIndex: "999999",
                pointerEvents: "none",
                boxSizing: "border-box"
            }
        );

        progressTrack =
            document.createElement("div");

        progressTrack.setAttribute(
            "data-progress-track",
            "true"
        );

        Object.assign(
            progressTrack.style,
            {
                position: "relative",
                width: "100%",
                overflow: "hidden",
                backgroundColor: bgColour,
                borderRadius: borderRadius,
                boxSizing: "border-box"
            }
        );

        progressFill =
            document.createElement("div");

        progressFill.setAttribute(
            "data-progress-fill",
            "true"
        );

        Object.assign(
            progressFill.style,
            {
                position: "absolute",
                top: "0",
                left: "0",
                width: "0%",
                height: "100%",
                backgroundColor: barColour,
                borderRadius: borderRadius,
                transition:
                    "width 0.25s ease, " +
                    "background-color 0.25s ease",
                boxSizing: "border-box"
            }
        );

        progressTrack.setAttribute(
            "role",
            "progressbar"
        );

        progressTrack.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressTrack.setAttribute(
            "aria-valuemax",
            String(totalScreens)
        );

        progressTrack.appendChild(
            progressFill
        );

        progressWrapper.appendChild(
            progressTrack
        );

        slide.appendChild(
            progressWrapper
        );
    }

    /* =========================
       RESPONSIVE POSITIONING
    ========================= */

    function updateLayout() {
        if (
            !activeSlide ||
            !progressWrapper ||
            !progressTrack
        ) {
            return;
        }

        const rect =
            activeSlide.getBoundingClientRect();

        const slideWidth =
            activeSlide.clientWidth ||
            rect.width ||
            960;

        const slideHeight =
            activeSlide.clientHeight ||
            rect.height ||
            540;

        const responsiveWidth =
            clamp(
                slideWidth * barWidthRatio,
                minimumBarWidth,
                maximumBarWidth
            );

        const responsiveHeight =
            clamp(
                slideHeight * 0.027,
                minimumBarHeight,
                maximumBarHeight
            );

        const responsiveLeft =
            Math.max(
                10,
                slideWidth *
                    leftPositionRatio
            );

        const responsiveBottom =
            Math.max(
                8,
                slideHeight *
                    bottomPositionRatio
            );

        Object.assign(
            progressWrapper.style,
            {
                width:
                    responsiveWidth + "px",

                left:
                    responsiveLeft + "px",

                bottom:
                    responsiveBottom + "px"
            }
        );

        progressTrack.style.height =
            responsiveHeight + "px";
    }

    /* =========================
       UPDATE BAR
    ========================= */

    function updateProgress(forceUpdate) {
        if (
            !progressFill ||
            !progressTrack
        ) {
            return;
        }

        const current =
            getProgressValue();

        if (
            !forceUpdate &&
            current === previousProgressValue
        ) {
            return;
        }

        previousProgressValue =
            current;

        const percentage =
            getPercentage(current);

        progressFill.style.width =
            percentage + "%";

        progressFill.style.backgroundColor =
            percentage >= 100
                ? completedColour
                : barColour;

        progressTrack.setAttribute(
            "aria-valuenow",
            String(current)
        );

        progressTrack.setAttribute(
            "aria-valuetext",
            `${Math.round(percentage)}% complete`
        );
    }

    /* =========================
       DETECT ACTIVE SLIDE
    ========================= */

    function refreshActiveSlide(forceUpdate) {
        const detectedSlide =
            findActiveSlide();

        if (!detectedSlide) {
            return;
        }

        const slideChanged =
            detectedSlide !== activeSlide;

        if (slideChanged) {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            activeSlide =
                detectedSlide;

            progressWrapper = null;
            progressTrack = null;
            progressFill = null;

            previousProgressValue = null;

            removeStaleProgressBars();
            createProgressBar(activeSlide);
            updateLayout();
            updateProgress(true);

            if (
                typeof ResizeObserver !==
                "undefined"
            ) {
                resizeObserver =
                    new ResizeObserver(
                        function () {
                            updateLayout();
                        }
                    );

                resizeObserver.observe(
                    activeSlide
                );
            }
        } else {
            /*
               Recreate the bar if Storyline removed it
               while rebuilding slide content.
            */
            if (
                !progressWrapper ||
                !progressWrapper.isConnected
            ) {
                createProgressBar(activeSlide);
                updateLayout();
                updateProgress(true);
            } else {
                updateProgress(
                    Boolean(forceUpdate)
                );
            }
        }
    }

    /* =========================
       INITIALISE
    ========================= */

    refreshActiveSlide(true);

    /*
       Check frequently for both:
       1. ProgressCurrent changes
       2. Storyline slide-container changes
    */
    progressTimer =
        setInterval(function () {
            refreshActiveSlide(false);
        }, updateInterval);

    /*
       Storyline modifies the slide DOM during navigation
       and some opening animations.
    */
    mutationObserver =
        new MutationObserver(function () {
            refreshActiveSlide(true);
        });

    mutationObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "style",
                "class",
                "aria-hidden"
            ]
        }
    );

    function handleResize() {
        refreshActiveSlide(true);
        updateLayout();
    }

    window.addEventListener(
        "resize",
        handleResize
    );

    /* =========================
       PUBLIC REFRESH FUNCTION
    ========================= */

    window.updateStorylineProgressBar =
        function () {
            previousProgressValue = null;
            refreshActiveSlide(true);
            updateProgress(true);
        };

    /* =========================
       CONTROLLER AND CLEANUP
    ========================= */

    window.__courseProgressController = {
        destroy: function () {
            if (progressTimer) {
                clearInterval(
                    progressTimer
                );
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
            }

            if (mutationObserver) {
                mutationObserver.disconnect();
            }

            window.removeEventListener(
                "resize",
                handleResize
            );
        }
    };
})();
}

window.Script97 = function()
{
  (function () {
  try {
    var raw = GetPlayer().GetVar('FS');
    var isFS = (raw === true || raw === 1 || raw === 'true' || raw === 'True');
    if (window._slSidebarCtl && typeof window._slSidebarCtl.onFSChange === 'function') {
      window._slSidebarCtl.onFSChange(isFS);
    }
  } catch (e) {}
})();
}

window.Script98 = function()
{
  const player = GetPlayer();

player.SetVar("Slider1", Math.round(DS.appState.currentVolume() * 10));

let lastVolume = DS.appState.currentVolume();

if (window.volumeWatcher) {
    clearInterval(window.volumeWatcher);
}

window.volumeWatcher = setInterval(() => {
    const currentVolume = DS.appState.currentVolume();

    if (Math.abs(currentVolume - lastVolume) > 0.001) {
        lastVolume = currentVolume;

        player.SetVar("Slider1", Math.round(currentVolume * 10));
    }
}, 50);
}

window.Script99 = function()
{
  window.lockCourseProgress(10);
}

window.Script100 = function()
{
  const player = GetPlayer();

let slider = Number(player.GetVar("Slider1"));

// Keep the value between 0 and 10
slider = Math.max(0, Math.min(10, slider));

// Convert 0–10 into Storyline volume range 0–1
DS.appState.setVolume(slider / 10);

// Store the value in another Storyline variable if needed
player.SetVar("Slider1", slider);
player.SetVar("Slider2", slider);
}

};
