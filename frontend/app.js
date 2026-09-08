const API_BASE_URL = "http://127.0.0.1:8787";
const API_KEY_STORAGE = "cloudpulse_api_key";

let autoRefreshTimer = null;


/* =========================
   Storage
   ========================= */

function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE);
}

function saveApiKey(apiKey) {
    localStorage.setItem(API_KEY_STORAGE, apiKey);
}


/* =========================
   DOM
   ========================= */

const servicesList =
    document.getElementById("services-list");

const totalServicesElement =
    document.getElementById("total-services");

const upServicesElement =
    document.getElementById("up-services");

const downServicesElement =
    document.getElementById("down-services");

const unknownServicesElement =
    document.getElementById("unknown-services");

const overallStatusText =
    document.getElementById("overall-status-text");

const overallStatusDot =
    document.getElementById("overall-status-dot");

const addServiceButton =
    document.getElementById("add-service-btn");

const serviceModal =
    document.getElementById("service-modal");

const closeModalButton =
    document.getElementById("close-modal-btn");

const cancelButton =
    document.getElementById("cancel-btn");

const serviceForm =
    document.getElementById("service-form");

const serviceNameInput =
    document.getElementById("service-name");

const serviceUrlInput =
    document.getElementById("service-url");

const formError =
    document.getElementById("form-error");

const detailsModal =
    document.getElementById("details-modal");

const closeDetailsButton =
    document.getElementById("close-details-btn");

const detailsServiceName =
    document.getElementById("details-service-name");

const detailsServiceUrl =
    document.getElementById("details-service-url");

const detailsStatus =
    document.getElementById("details-status");

const detailsStatusDot =
    document.getElementById("details-status-dot");

const detailsUptime =
    document.getElementById("details-uptime");

const detailsTotalChecks =
    document.getElementById("details-total-checks");

const detailsSuccessfulChecks =
    document.getElementById("details-successful-checks");

const detailsFailedChecks =
    document.getElementById("details-failed-checks");

const detailsAverageResponse =
    document.getElementById("details-average-response");

const detailsFastestResponse =
    document.getElementById("details-fastest-response");

const detailsSlowestResponse =
    document.getElementById("details-slowest-response");

const detailsChecks =
    document.getElementById("details-checks");

const detailsIncidents =
    document.getElementById("details-incidents");


/* =========================
   API Helpers
   ========================= */

async function apiRequest(path, options = {}) {
    const response = await fetch(
        `${API_BASE_URL}${path}`,
        options
    );

    let data = null;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        throw new Error(
            data?.error ||
            `Request failed with status ${response.status}`
        );
    }

    return data;
}


/* =========================
   Services
   ========================= */

async function loadServices() {
    servicesList.innerHTML = `
        <div class="loading">
            Loading services...
        </div>
    `;

    try {
        const data = await apiRequest(
            "/api/services"
        );

        renderServices(
            Array.isArray(data.services)
                ? data.services
                : []
        );

    } catch (error) {
        console.error(
            "Failed to load services:",
            error
        );

        servicesList.innerHTML = `
            <div class="empty-state">
                <strong>Unable to load services</strong>
                <span>${escapeHtml(error.message)}</span>
            </div>
        `;
    }
}

function renderServices(services) {
    updateSummary(services);

    if (services.length === 0) {
        servicesList.innerHTML = `
            <div class="empty-state">
                <strong>No monitored services</strong>
                <span>Add your first service to begin monitoring.</span>
            </div>
        `;

        return;
    }

    servicesList.innerHTML =
        services.map(service => {
            const statusInfo =
                getStatusInfo(service.status);

            return `
                <div class="service-card">

                    <div class="service-info">

                        <span class="service-name">
                            ${escapeHtml(service.name)}
                        </span>

                        <span class="service-url">
                            ${escapeHtml(service.url)}
                        </span>

                    </div>

                    <div class="service-actions">

                        <div class="service-status">

                            <span
                                class="service-status-dot"
                                style="background:${statusInfo.color};"
                            ></span>

                            <span>
                                ${statusInfo.label}
                            </span>

                        </div>

                        <button
                            class="view-details-btn"
                            data-service-id="${service.id}"
                            type="button"
                        >
                            View Details
                        </button>

                        <button
                            class="check-service-btn"
                            data-service-id="${service.id}"
                            type="button"
                        >
                            Check Now
                        </button>

                    </div>

                </div>
            `;
        }).join("");

    document
        .querySelectorAll(".check-service-btn")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => checkService(
                    Number(button.dataset.serviceId),
                    button
                )
            );
        });

    document
        .querySelectorAll(".view-details-btn")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => openServiceDetails(
                    Number(button.dataset.serviceId)
                )
            );
        });
}


/* =========================
   Summary
   ========================= */

function updateSummary(services) {
    const upCount = services.filter(
        service => service.status === "UP"
    ).length;

    const downCount = services.filter(
        service => service.status === "DOWN"
    ).length;

    const unknownCount = services.filter(
        service => service.status === "UNKNOWN"
    ).length;

    totalServicesElement.textContent =
        services.length;

    upServicesElement.textContent =
        upCount;

    downServicesElement.textContent =
        downCount;

    unknownServicesElement.textContent =
        unknownCount;

    if (services.length === 0) {
        overallStatusText.textContent =
            "No services";

        overallStatusDot.style.background =
            "#94a3b8";

        return;
    }

    if (downCount > 0) {
        overallStatusText.textContent =
            "Service disruption";

        overallStatusDot.style.background =
            "#dc2626";

        return;
    }

    if (unknownCount > 0) {
        overallStatusText.textContent =
            "Monitoring";

        overallStatusDot.style.background =
            "#f0ad00";

        return;
    }

    overallStatusText.textContent =
        "All systems operational";

    overallStatusDot.style.background =
        "#16a34a";
}


/* =========================
   Manual Check
   ========================= */

async function checkService(
    serviceId,
    button
) {
    let apiKey = getApiKey();

    if (!apiKey) {
        apiKey = prompt(
            "Enter your CloudPulse API key:"
        );

        if (!apiKey) {
            return;
        }

        saveApiKey(apiKey);
    }

    const originalText =
        button.textContent;

    button.disabled = true;
    button.textContent = "Checking...";

    try {
        await apiRequest(
            `/api/services/${serviceId}/check`,
            {
                method: "POST",

                headers: {
                    "X-API-Key": apiKey
                }
            }
        );

        await loadServices();

        if (
            !detailsModal.classList.contains("hidden")
        ) {
            await loadServiceDetails(
                serviceId
            );
        }

    } catch (error) {
        console.error(
            "Health check failed:",
            error
        );

        alert(error.message);

    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}


/* =========================
   Add Service
   ========================= */

function openAddServiceModal() {
    formError.classList.add("hidden");
    formError.textContent = "";

    serviceForm.reset();

    serviceModal.classList.remove("hidden");

    serviceNameInput.focus();
}

function closeAddServiceModal() {
    serviceModal.classList.add("hidden");

    formError.classList.add("hidden");
    formError.textContent = "";
}

serviceForm.addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        const name =
            serviceNameInput.value.trim();

        const url =
            serviceUrlInput.value.trim();

        if (!name || !url) {
            showFormError(
                "Name and URL are required."
            );

            return;
        }

        let apiKey = getApiKey();

        if (!apiKey) {
            apiKey = prompt(
                "Enter your CloudPulse API key:"
            );

            if (!apiKey) {
                return;
            }

            saveApiKey(apiKey);
        }

        const saveButton =
            document.getElementById(
                "save-service-btn"
            );

        const originalText =
            saveButton.textContent;

        saveButton.disabled = true;
        saveButton.textContent = "Adding...";

        try {
            await apiRequest(
                "/api/services",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "X-API-Key":
                            apiKey
                    },

                    body: JSON.stringify({
                        name,
                        url
                    })
                }
            );

            closeAddServiceModal();

            await loadServices();

        } catch (error) {
            console.error(
                "Failed to create service:",
                error
            );

            showFormError(
                error.message
            );

        } finally {
            saveButton.disabled = false;
            saveButton.textContent =
                originalText;
        }
    }
);

function showFormError(message) {
    formError.textContent = message;

    formError.classList.remove(
        "hidden"
    );
}


/* =========================
   Service Details
   ========================= */

async function openServiceDetails(
    serviceId
) {
    detailsModal.classList.remove(
        "hidden"
    );

    resetDetailsState();

    await loadServiceDetails(
        serviceId
    );
}

async function loadServiceDetails(
    serviceId
) {
    try {
        const [
            analytics,
            checks,
            incidents
        ] = await Promise.all([
            apiRequest(
                `/api/services/${serviceId}/analytics`
            ),

            apiRequest(
                `/api/services/${serviceId}/checks`
            ),

            apiRequest(
                `/api/services/${serviceId}/incidents`
            )
        ]);

        renderAnalytics(analytics);
        renderChecks(checks);
        renderIncidents(incidents);

    } catch (error) {
        console.error(
            "Failed to load service details:",
            error
        );

        detailsChecks.innerHTML = `
            <div class="empty-state">
                <strong>Unable to load details</strong>
                <span>${escapeHtml(error.message)}</span>
            </div>
        `;

        detailsIncidents.innerHTML = "";
    }
}

function resetDetailsState() {
    detailsServiceName.textContent =
        "Service Details";

    detailsServiceUrl.textContent = "";

    detailsStatus.textContent =
        "Loading...";

    detailsStatusDot.style.background =
        "#94a3b8";

    detailsUptime.textContent = "—";
    detailsTotalChecks.textContent = "—";
    detailsSuccessfulChecks.textContent = "—";
    detailsFailedChecks.textContent = "—";
    detailsAverageResponse.textContent = "—";
    detailsFastestResponse.textContent = "—";
    detailsSlowestResponse.textContent = "—";

    detailsChecks.innerHTML = `
        <div class="loading">
            Loading checks...
        </div>
    `;

    detailsIncidents.innerHTML = `
        <div class="loading">
            Loading incidents...
        </div>
    `;
}


/* =========================
   Analytics
   ========================= */

function renderAnalytics(data) {
    const service =
        data.service || {};

    const statusInfo =
        getStatusInfo(
            service.status
        );

    detailsServiceName.textContent =
        service.name ||
        "Service Details";

    detailsServiceUrl.textContent =
        service.url || "";

    detailsStatus.textContent =
        statusInfo.label;

    detailsStatusDot.style.background =
        statusInfo.color;

    detailsUptime.textContent =
        formatPercentage(
            data.uptime_percentage
        );

    detailsTotalChecks.textContent =
        safeNumber(
            data.total_checks
        );

    detailsSuccessfulChecks.textContent =
        safeNumber(
            data.successful_checks
        );

    detailsFailedChecks.textContent =
        safeNumber(
            data.failed_checks
        );

    detailsAverageResponse.textContent =
        formatMilliseconds(
            data.average_response_time_ms
        );

    detailsFastestResponse.textContent =
        formatMilliseconds(
            data.fastest_response_time_ms
        );

    detailsSlowestResponse.textContent =
        formatMilliseconds(
            data.slowest_response_time_ms
        );
}


/* =========================
   Checks
   ========================= */

function renderChecks(data) {
    const checks =
        Array.isArray(data.checks)
            ? data.checks
            : [];

    if (checks.length === 0) {
        detailsChecks.innerHTML = `
            <div class="empty-state">
                <strong>No checks yet</strong>
                <span>This service has no checks in the last 24 hours.</span>
            </div>
        `;

        return;
    }

    const recentChecks =
        checks.slice(-10).reverse();

    detailsChecks.innerHTML = `
        <div class="check-list">

            ${recentChecks.map(check => {
                const isUp =
                    check.status === "UP";

                return `
                    <div class="check-row">

                        <span
                            class="check-status ${
                                isUp
                                    ? "check-up"
                                    : "check-down"
                            }"
                        >
                            ${escapeHtml(check.status)}
                        </span>

                        <span class="check-code">
                            ${
                                check.status_code ??
                                "—"
                            }
                        </span>

                        <span class="check-time">
                            ${formatDateTime(check.checked_at)}
                        </span>

                        <span class="check-response">
                            ${formatMilliseconds(
                                check.response_time_ms
                            )}
                        </span>

                    </div>
                `;
            }).join("")}

        </div>
    `;
}


/* =========================
   Incidents
   ========================= */

function renderIncidents(data) {
    const incidents =
        Array.isArray(data.incidents)
            ? data.incidents
            : [];

    if (incidents.length === 0) {
        detailsIncidents.innerHTML = `
            <div class="empty-state">
                <strong>No incidents</strong>
                <span>No incidents have been recorded for this service.</span>
            </div>
        `;

        return;
    }

    detailsIncidents.innerHTML = `
        <div class="incident-list">

            ${incidents.map(incident => {
                const resolved =
                    Boolean(
                        incident.resolved_at
                    );

                return `
                    <div class="incident-row">

                        <div>

                            <div class="incident-reason">
                                ${escapeHtml(
                                    incident.reason ||
                                    "Service unavailable"
                                )}
                            </div>

                            <div class="incident-time">
                                Started:
                                ${formatDateTime(
                                    incident.started_at
                                )}
                            </div>

                            ${
                                resolved
                                    ? `
                                        <div class="incident-time">
                                            Resolved:
                                            ${formatDateTime(
                                                incident.resolved_at
                                            )}
                                        </div>
                                    `
                                    : ""
                            }

                        </div>

                        <span
                            class="incident-status ${
                                resolved
                                    ? "incident-resolved"
                                    : "incident-open"
                            }"
                        >
                            ${
                                resolved
                                    ? "RESOLVED"
                                    : "OPEN"
                            }
                        </span>

                    </div>
                `;
            }).join("")}

        </div>
    `;
}


/* =========================
   Formatting
   ========================= */

function getStatusInfo(status) {
    if (status === "UP") {
        return {
            label: "UP",
            color: "#16a34a"
        };
    }

    if (status === "DOWN") {
        return {
            label: "DOWN",
            color: "#dc2626"
        };
    }

    return {
        label: "UNKNOWN",
        color: "#f0ad00"
    };
}

function safeNumber(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "0";
    }

    return String(value);
}

function formatPercentage(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "—";
    }

    const number =
        Number(value);

    if (Number.isNaN(number)) {
        return "—";
    }

    return `${number.toFixed(2)}%`;
}

function formatMilliseconds(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "—";
    }

    const number =
        Number(value);

    if (Number.isNaN(number)) {
        return "—";
    }

    return `${Math.round(number)} ms`;
}


/*
 * D1 CURRENT_TIMESTAMP values are UTC
 * in the format:
 *
 * YYYY-MM-DD HH:MM:SS
 *
 * Convert them explicitly to ISO UTC
 * before creating the Date object.
 */
function formatDateTime(value) {
    if (!value) {
        return "—";
    }

    let normalized = value;

    if (
        typeof value === "string" &&
        !value.includes("T")
    ) {
        normalized =
            value.replace(
                " ",
                "T"
            ) + "Z";
    }

    const date =
        new Date(normalized);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return value;
    }

    return date.toLocaleString(
        undefined,
        {
            dateStyle: "medium",
            timeStyle: "medium"
        }
    );
}

function escapeHtml(value) {
    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


/* =========================
   Modal Events
   ========================= */

addServiceButton.addEventListener(
    "click",
    openAddServiceModal
);

closeModalButton.addEventListener(
    "click",
    closeAddServiceModal
);

cancelButton.addEventListener(
    "click",
    closeAddServiceModal
);

closeDetailsButton.addEventListener(
    "click",
    () => {
        detailsModal.classList.add(
            "hidden"
        );
    }
);

serviceModal.addEventListener(
    "click",
    event => {
        if (
            event.target ===
            serviceModal
        ) {
            closeAddServiceModal();
        }
    }
);

detailsModal.addEventListener(
    "click",
    event => {
        if (
            event.target ===
            detailsModal
        ) {
            detailsModal.classList.add(
                "hidden"
            );
        }
    }
);

document.addEventListener(
    "keydown",
    event => {
        if (
            event.key === "Escape"
        ) {
            closeAddServiceModal();

            detailsModal.classList.add(
                "hidden"
            );
        }
    }
);


/* =========================
   Auto Refresh
   ========================= */

function startAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(
            autoRefreshTimer
        );
    }

    autoRefreshTimer =
        setInterval(
            () => {
                loadServices();
            },
            30000
        );
}


/* =========================
   Initial Load
   ========================= */

loadServices();

startAutoRefresh();