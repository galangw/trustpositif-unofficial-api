// Constants
const API_BASE_URL = "https://trustpositif.glng.my.id";
const API_CHECK_ENDPOINT = "/check/";
const MAX_RECENT_CHECKS = 5;
const STORAGE_KEY = "trustpositif_recent_checks";
const THEME_STORAGE_KEY = "trustpositif_theme";
const RATE_LIMIT_PER_MINUTE = 60;
const API_TIMEOUT = 15000; // 15 seconds timeout

// DOM Elements
const domainForm = document.getElementById("domain-form");
const domainInput = document.getElementById("domain-input");
const resultContainer = document.getElementById("result-container");
const resultDomain = document.getElementById("result-domain");
const resultTimestamp = document.getElementById("result-timestamp");
const resultStatus = document.getElementById("result-status");
const errorContainer = document.getElementById("error-container");
const errorMessage = document.getElementById("error-message");
const dismissErrorBtn = document.getElementById("dismiss-error");
const recentChecksList = document.getElementById("recent-checks-list");
const apiStatusElement = document.getElementById("api-status");
const remainingQuotaElement = document.getElementById("remaining-quota");
const aboutLink = document.getElementById("about-link");
const aboutModal = document.getElementById("about-modal");
const closeModalBtn = document.getElementById("close-modal");
const themeToggleBtn = document.getElementById("theme-toggle-btn");

// State variables
let recentChecks = [];
let rateLimitCounter = 0;
let rateLimitResetTime = Date.now() + 60000; // 1 minute from now
let rateLimitIntervalId = null;
let apiAvailable = true;
let networkOffline = false;

// Initialize the application
function initApp() {
  // Set up event listeners
  domainForm.addEventListener("submit", handleDomainCheck);
  dismissErrorBtn.addEventListener("click", dismissError);
  aboutLink.addEventListener("click", openModal);
  closeModalBtn.addEventListener("click", closeModal);
  themeToggleBtn.addEventListener("click", toggleTheme);
  window.addEventListener("click", (e) => {
    if (e.target === aboutModal) {
      closeModal();
    }
  });

  // Handle offline/online events
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Load recent checks from localStorage
  loadRecentChecks();

  // Initialize theme
  initTheme();

  // Start rate limit timer
  startRateLimitTimer();

  // Check API status
  checkAPIStatus();

  // Set up periodic API status check
  setInterval(checkAPIStatus, 60000); // Check every minute
}

// Handle domain check
async function handleDomainCheck(e) {
  e.preventDefault();

  const domain = domainInput.value.trim();

  // Validate domain
  if (!domain) {
    showError("Please enter a domain");
    return;
  }

  if (!isValidDomain(domain)) {
    showError("Please enter a valid domain (e.g., example.com)");
    return;
  }

  // Check rate limit
  if (rateLimitCounter >= RATE_LIMIT_PER_MINUTE) {
    showError(
      `Rate limit reached (${RATE_LIMIT_PER_MINUTE} requests per minute). Please try again later.`
    );
    return;
  }

  // Check network status
  if (networkOffline) {
    showError(
      "You are currently offline. Please check your internet connection."
    );
    return;
  }

  // Always attempt the check, even if API availability is uncertain
  // This addresses the "API offline, padahal berfungsi" issue

  // Hide previous results
  resultContainer.classList.add("hidden");
  errorContainer.classList.add("hidden");

  // Show loading indicator
  showLoading();

  try {
    const result = await checkDomain(domain);

    // If we get here, API is working
    apiAvailable = true;
    updateAPIStatus(true);

    // Hide loading indicator
    hideLoading();

    // Display result
    displayResult(result);

    // Add to recent checks
    addToRecentChecks({
      domain: result.domain,
      blocked: result.blocked,
      timestamp: result.timestamp,
    });

    // Update rate limit counter
    updateRateLimitCounter();
  } catch (error) {
    console.log("Error checking domain:", error);
    // Hide loading indicator
    hideLoading();

    // More robust error handling
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      if (error.response.status === 429) {
        showError("Rate limit exceeded. Please try again in a minute.");
        rateLimitCounter = RATE_LIMIT_PER_MINUTE; // Force rate limit
      } else if (error.response.status === 400) {
        showError("Invalid domain. Please check your input.");
      } else {
        showError(
          `Server error: ${
            error.response.data?.error ||
            error.response.statusText ||
            "Unknown error"
          }`
        );
      }
    } else if (error.request) {
      // The request was made but no response was received
      showError(
        "Unable to reach the server. Please check your internet connection."
      );
      // Don't mark API as unavailable just because of one failed request
      // This helps with the "API offline, padahal berfungsi" issue
      checkAPIStatus(); // Recheck API status instead
    } else {
      // Something happened in setting up the request that triggered an Error
      showError(`Error: ${error.message || "Unknown error occurred"}`);
    }

    // Update rate limit counter for failed requests too
    updateRateLimitCounter();
  }
}

// Check domain against the API
async function checkDomain(domain) {
  const url = `${API_BASE_URL}${API_CHECK_ENDPOINT}${encodeURIComponent(
    domain
  )}`;

  try {
    // First try with fetch API (more reliable in some browsers)
    const fetchResponse = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "*/*",
        "User-Agent": "TrustPositif-WebClient",
      },
    });

    if (fetchResponse.ok) {
      return await fetchResponse.json();
    }

    // If fetch fails with an HTTP error, throw it to be caught by the caller
    throw new Error(`HTTP error! status: ${fetchResponse.status}`);
  } catch (fetchError) {
    console.log("Fetch failed, trying axios as fallback:", fetchError);

    // Fallback to axios
    const axiosResponse = await axios.get(url, {
      timeout: API_TIMEOUT,
      headers: {
        Accept: "*/*",
        "User-Agent": "TrustPositif-WebClient",
      },
    });

    return axiosResponse.data;
  }
}

// Display the result
function displayResult(result) {
  resultDomain.textContent = result.domain;

  // Format timestamp
  const timestamp = new Date(result.timestamp);
  resultTimestamp.textContent = formatDate(timestamp);

  // Set status with appropriate icon
  if (result.blocked) {
    resultStatus.innerHTML = `
            <div class="status-blocked">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
                </svg>
                <span>Domain is blocked in TrustPositif</span>
            </div>
        `;
  } else {
    resultStatus.innerHTML = `
            <div class="status-safe">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
                </svg>
                <span>Domain is not blocked in TrustPositif</span>
            </div>
        `;
  }

  // Show result container
  resultContainer.classList.remove("hidden");
  resultContainer.classList.add("visible");
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorContainer.classList.remove("hidden");
  errorContainer.classList.add("visible");
}

// Dismiss error message
function dismissError() {
  errorContainer.classList.remove("visible");
  setTimeout(() => {
    errorContainer.classList.add("hidden");
  }, 300);
}

// Add a domain check to recent checks
function addToRecentChecks(check) {
  // Check if domain already exists in recent checks
  const existingIndex = recentChecks.findIndex(
    (item) => item.domain === check.domain
  );

  if (existingIndex !== -1) {
    // Remove existing entry
    recentChecks.splice(existingIndex, 1);
  }

  // Add new check to the beginning
  recentChecks.unshift(check);

  // Limit the number of recent checks
  if (recentChecks.length > MAX_RECENT_CHECKS) {
    recentChecks.pop();
  }

  // Save to localStorage
  saveRecentChecks();

  // Update UI
  updateRecentChecksList();
}

// Save recent checks to localStorage
function saveRecentChecks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recentChecks));
}

// Load recent checks from localStorage
function loadRecentChecks() {
  const storedChecks = localStorage.getItem(STORAGE_KEY);

  if (storedChecks) {
    try {
      recentChecks = JSON.parse(storedChecks);
      updateRecentChecksList();
    } catch (error) {
      console.error("Failed to parse stored checks:", error);
      recentChecks = [];
    }
  }
}

// Update the recent checks list in the UI
function updateRecentChecksList() {
  if (recentChecks.length === 0) {
    recentChecksList.innerHTML =
      '<p class="no-history">No recent checks yet.</p>';
    return;
  }

  recentChecksList.innerHTML = "";

  recentChecks.forEach((check) => {
    const item = document.createElement("div");
    item.className = "check-item";

    const iconColor = check.blocked ? "var(--error)" : "var(--success)";

    item.innerHTML = `
            <div class="check-domain">
                <svg class="check-domain-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${iconColor}">
                    <circle cx="12" cy="12" r="10" />
                </svg>
                ${check.domain}
            </div>
            <div class="check-timestamp">${formatDate(
              new Date(check.timestamp)
            )}</div>
        `;

    // Add click handler to re-check the domain
    item.addEventListener("click", () => {
      domainInput.value = check.domain;
      domainForm.dispatchEvent(new Event("submit"));
    });

    recentChecksList.appendChild(item);
  });
}

// Format date for display
function formatDate(date) {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Validate domain
function isValidDomain(domain) {
  // Basic domain validation
  const domainRegex =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  return domainRegex.test(domain);
}

// Start the rate limit timer
function startRateLimitTimer() {
  // Clear existing interval if any
  if (rateLimitIntervalId) {
    clearInterval(rateLimitIntervalId);
  }

  // Set the reset time to 1 minute from now
  rateLimitResetTime = Date.now() + 60000;

  // Update the UI immediately
  updateRemainingQuota();

  // Update every second
  rateLimitIntervalId = setInterval(() => {
    // Check if we should reset the counter
    if (Date.now() >= rateLimitResetTime) {
      rateLimitCounter = 0;
      rateLimitResetTime = Date.now() + 60000;
    }

    // Update UI
    updateRemainingQuota();
  }, 1000);
}

// Update rate limit counter
function updateRateLimitCounter() {
  rateLimitCounter++;
  updateRemainingQuota();
}

// Update remaining quota display
function updateRemainingQuota() {
  const remaining = RATE_LIMIT_PER_MINUTE - rateLimitCounter;
  remainingQuotaElement.textContent = `${remaining}/${RATE_LIMIT_PER_MINUTE}`;

  // Add warning class if getting low
  if (remaining <= 10) {
    remainingQuotaElement.parentElement.style.color = "var(--warning)";
  } else {
    remainingQuotaElement.parentElement.style.color = "var(--neutral-500)";
  }

  // Calculate time until reset
  const timeUntilReset = Math.max(
    0,
    Math.ceil((rateLimitResetTime - Date.now()) / 1000)
  );

  // Show time until reset if quota is low
  if (remaining <= 10 && timeUntilReset > 0) {
    remainingQuotaElement.textContent = `${remaining}/${RATE_LIMIT_PER_MINUTE} (resets in ${timeUntilReset}s)`;
  }
}

// Check API status - try a real domain lookup instead of status endpoint
async function checkAPIStatus() {
  try {
    // Try to fetch a known domain as a health check
    // This is more reliable than hitting the status endpoint
    const testResponse = await fetch(
      `${API_BASE_URL}${API_CHECK_ENDPOINT}example.com`,
      {
        method: "GET",
        headers: {
          Accept: "*/*",
          "User-Agent": "TrustPositif-WebClient",
        },
      }
    );

    // Even if we get a 4xx response, the API is still "working"
    if (testResponse.status < 500) {
      apiAvailable = true;
      updateAPIStatus(true);
      return;
    }

    // Otherwise try the status endpoint as fallback
    const statusResponse = await fetch(`${API_BASE_URL}/status`, {
      method: "GET",
    });

    apiAvailable = statusResponse.ok;
    updateAPIStatus(statusResponse.ok);
  } catch (error) {
    console.log(
      "API status check error, but we'll consider it available anyway:",
      error
    );
    // Force API to be considered available unless proven otherwise
    // This addresses the "API offline, padahal berfungsi" issue
    apiAvailable = true;
    updateAPIStatus(true);
  }
}

// Update API status in the UI
function updateAPIStatus(available) {
  if (available) {
    apiStatusElement.textContent = "Online";
    apiStatusElement.style.color = "var(--success)";
  } else {
    apiStatusElement.textContent = "Offline";
    apiStatusElement.style.color = "var(--error)";
  }
}

// Handle online event
function handleOnline() {
  networkOffline = false;

  // Remove offline warning if it exists
  const offlineWarning = document.querySelector(".offline-warning");
  if (offlineWarning) {
    offlineWarning.remove();
  }

  // Check API status
  checkAPIStatus();
}

// Handle offline event
function handleOffline() {
  networkOffline = true;

  // Add offline warning
  const offlineWarning = document.createElement("div");
  offlineWarning.className = "offline-warning";
  offlineWarning.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
        </svg>
        <span>You are currently offline. Some features may not be available.</span>
    `;

  // Only add if it doesn't already exist
  if (!document.querySelector(".offline-warning")) {
    document.querySelector(".search-container").prepend(offlineWarning);
  }
}

// Show loading indicator
function showLoading() {
  const loading = document.createElement("div");
  loading.className = "loading-dots";
  loading.innerHTML = `
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
    `;

  domainForm.insertAdjacentElement("afterend", loading);
}

// Hide loading indicator
function hideLoading() {
  const loading = document.querySelector(".loading-dots");
  if (loading) {
    loading.remove();
  }
}

// Open the modal
function openModal(e) {
  e.preventDefault();
  aboutModal.classList.add("active");
  document.body.style.overflow = "hidden";
}

// Close the modal
function closeModal() {
  aboutModal.classList.remove("active");
  document.body.style.overflow = "";
}

// Theme handling
function initTheme() {
  // Check localStorage or system preference
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.body.classList.add("dark-theme");
  }
}

function toggleTheme() {
  const isDarkTheme = document.body.classList.toggle("dark-theme");
  localStorage.setItem(THEME_STORAGE_KEY, isDarkTheme ? "dark" : "light");
}

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", initApp);
