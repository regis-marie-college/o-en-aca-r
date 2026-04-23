"use strict";

let activeBillingFilter = "paid";

function getCurrentUser() {
  if (typeof window.getStoredUser === "function") {
    return window.getStoredUser() || {};
  }

  try {
    return JSON.parse(
      sessionStorage.getItem("user") || localStorage.getItem("user") || "{}",
    );
  } catch (error) {
    return {};
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value || 0));
}

function buildBillingBreakdown(totalAmount) {
  const total = Number(totalAmount || 0);
  const downpayment = Math.min(2000, Math.max(total, 0));
  const remainingBalance = Math.max(total - downpayment, 0);
  const baseInstallment = Number((remainingBalance / 4).toFixed(2));
  const installments = [];

  for (let index = 0; index < 4; index += 1) {
    if (index < 3) {
      installments.push(baseInstallment);
      continue;
    }

    const allocated = installments.reduce((sum, amount) => sum + amount, 0);
    installments.push(Number((remainingBalance - allocated).toFixed(2)));
  }

  return [downpayment, ...installments];
}

function renderBillingBreakdown(totalAmount) {
  const preview = document.querySelector("#billing-breakdown-preview");
  const labels = [
    "Downpayment",
    "1st Payment",
    "2nd Payment",
    "3rd Payment",
    "4th Payment",
  ];
  const amounts = buildBillingBreakdown(totalAmount);

  preview.innerHTML = labels
    .map((label, index) => {
      return `
        <article class="billing-breakdown-item">
          <span>${label}</span>
          <strong>${formatCurrency(amounts[index] || 0)}</strong>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return map[char] || char;
  });
}

function renderProofCell(value) {
  const proofValue = String(value || "").trim();

  if (!proofValue) {
    return "-";
  }

  if (proofValue.startsWith("/uploads/") || /^https?:\/\//i.test(proofValue)) {
    const label = escapeHtml(proofValue.split("/").pop() || "View Proof");
    const href = escapeHtml(proofValue);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  }

  return escapeHtml(proofValue);
}

function getBillingStageLabel(description) {
  const text = String(description || "").toLowerCase();

  if (text.includes("downpayment")) return "Downpayment";
  if (text.includes("1st")) return "1st Payment";
  if (text.includes("2nd")) return "2nd Payment";
  if (text.includes("3rd")) return "3rd Payment";
  if (text.includes("4th")) return "4th Payment";
  if (text.includes("misc")) return "Miscellaneous Fee";
  if (text.includes("id fee")) return "ID Fee";
  if (text.includes("tuition")) return "Tuition Fee";

  return "Other";
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function updateSummary(data) {
  const totalBalance = data.reduce(
    (sum, billing) => sum + Number(billing.balance || 0),
    0,
  );
  const totalPaid = data.reduce(
    (sum, billing) => sum + Number(billing.amount_paid || 0),
    0,
  );

  document.querySelector("#summary-count").textContent = data.length;
  document.querySelector("#summary-balance").textContent =
    formatCurrency(totalBalance);
  document.querySelector("#summary-paid").textContent =
    formatCurrency(totalPaid);
}

function filterVisibleBillings(data) {
  return (Array.isArray(data) ? data : []).filter((billing) => {
    const paymentStatus = normalizeValue(billing.payment_status);
    const hasApprovedPayment =
      paymentStatus === "approved" || Number(billing.amount_paid || 0) > 0;
    const isWaitingApproval = paymentStatus === "submitted";

    if (activeBillingFilter === "waiting") {
      return isWaitingApproval;
    }

    if (activeBillingFilter === "all") {
      return hasApprovedPayment || isWaitingApproval;
    }

    return hasApprovedPayment;
  });
}

function setBillingFilter(filterKey) {
  activeBillingFilter = filterKey;

  document.querySelectorAll(".billing-filter-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === filterKey);
  });
}

function initBillingFilterTabs() {
  document.querySelectorAll(".billing-filter-tab").forEach((button) => {
    button.addEventListener("click", () => {
      setBillingFilter(button.dataset.filter || "paid");
      loadBillings(document.querySelector(".search-box")?.value || "");
    });
  });
}

async function loadBillings(search = "") {
  const url = `${window.APP_CONFIG.API_BASE_URL}/billings/list${
    search ? `?search=${encodeURIComponent(search)}` : ""
  }`;
  const response = await fetch(url);
  const data = await response.json();
  const tbody = document.querySelector("#table-billings tbody");
  const visibleBillings = filterVisibleBillings(data);

  tbody.innerHTML = "";
  updateSummary(visibleBillings);

  if (!visibleBillings.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="15" class="billing-empty">
          No billing records found for the current search.
        </td>
      </tr>
    `;
    return;
  }

  visibleBillings.forEach((billing) => {
    const row = document.createElement("tr");
    const paymentMethod = normalizeValue(billing.payment_method);
    const paymentStatus = normalizeValue(billing.payment_status);
    const canReviewOnlinePayment =
      paymentMethod === "online" && paymentStatus === "submitted";
    const canCollectCash =
      Number(billing.balance || 0) > 0 && !canReviewOnlinePayment;

    row.innerHTML = `
      <td>${billing.student_name}<br /><small>${billing.email}</small></td>
      <td><span class="stage-pill">${getBillingStageLabel(billing.description)}</span></td>
      <td>${escapeHtml(billing.description)}</td>
      <td>${formatCurrency(billing.amount)}</td>
      <td>${formatCurrency(billing.amount_paid)}</td>
      <td>${formatCurrency(billing.balance)}</td>
      <td>${escapeHtml(billing.payment_method || "-")}</td>
      <td>${escapeHtml(billing.payment_channel || "-")}</td>
      <td>${escapeHtml(billing.reference_no || "-")}</td>
      <td>${renderProofCell(billing.proof_of_payment)}</td>
      <td>${escapeHtml(billing.notes || "-")}</td>
      <td class="${canReviewOnlinePayment ? "payment-pending" : ""}">${escapeHtml(billing.payment_status || "-")}</td>
      <td>${billing.due_date ? defaultDate(billing.due_date) : "-"}</td>
      <td><span class="status ${String(billing.status || "").toLowerCase()}">${billing.status}</span></td>
      <td>
        ${
          canReviewOnlinePayment
            ? `
              <button type="button" class="billing-button secondary btn-review-payment" data-id="${billing.id}" data-status="Approved">
                Approve
              </button>
              <button type="button" class="billing-button secondary btn-review-payment" data-id="${billing.id}" data-status="Denied">
                Reject
              </button>
            `
            : canCollectCash
              ? `
                <button type="button" data-id="${billing.id}" data-balance="${billing.balance}" class="billing-button secondary btn-pay">
                  Collect Payment
                </button>
              `
              : escapeHtml(
                  paymentMethod === "online" && paymentStatus === "approved"
                    ? "Online Payment Approved"
                    : paymentMethod === "online" && paymentStatus === "denied"
                      ? "Online Payment Rejected"
                      : Number(billing.balance || 0) <= 0
                        ? "Fully Paid"
                        : "-",
                )
        }
      </td>
    `;

    tbody.appendChild(row);
  });

  bindPaymentButtons();
  bindReviewButtons();
}

function bindPaymentButtons() {
  document.querySelectorAll(".btn-pay").forEach((button) => {
    button.addEventListener("click", async () => {
      const balance = Number(button.dataset.balance || 0);

      if (balance <= 0) {
        alert("This billing is already fully paid.");
        return;
      }

      const amount = window.prompt(`Enter payment amount (Remaining: ${balance})`);

      if (!amount) return;

      const user = getCurrentUser();

      const response = await fetch(
        `${window.APP_CONFIG.API_BASE_URL}/billings/update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: button.dataset.id,
            payment_amount: amount,
            payment_method: "Cash",
            processed_by: user.first_name || user.email || "Treasury",
          }),
        },
      );

      const data = await readApiResponse(response);

      if (!response.ok) {
        alert(data.error || "Failed to record payment");
        return;
      }

      await loadBillings(document.querySelector(".search-box").value);
    });
  });
}

function bindReviewButtons() {
  document.querySelectorAll(".btn-review-payment").forEach((button) => {
    button.addEventListener("click", async () => {
      const user = getCurrentUser();
      const nextStatus = button.dataset.status;
      const note = window.prompt(
        nextStatus === "Approved"
          ? "Add treasury note for this approved payment (optional)"
          : "Add treasury note for this denied payment (required)",
      );

      if (nextStatus === "Denied" && !String(note || "").trim()) {
        alert("Treasury note is required when denying a payment.");
        return;
      }

      const response = await fetch(
        `${window.APP_CONFIG.API_BASE_URL}/billings/update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: button.dataset.id,
            payment_status: nextStatus,
            notes: String(note || "").trim(),
            processed_by: user.first_name || user.email || "Treasury",
            treasury_reviewed_by: user.email || user.first_name || "Treasury",
          }),
        },
      );

      const data = await readApiResponse(response);

      if (!response.ok) {
        alert(data.error || "Failed to review billing payment");
        return;
      }

      await loadBillings(document.querySelector(".search-box").value);
    });
  });
}

async function initCreateBilling() {
  const form = document.querySelector("#billing-form");
  const amountInput = form.querySelector('[name="amount"]');

  amountInput.addEventListener("input", () => {
    renderBillingBreakdown(amountInput.value);
  });
  renderBillingBreakdown(amountInput.value);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const user = getCurrentUser();

    const response = await fetch(
      `${window.APP_CONFIG.API_BASE_URL}/billings/create`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_name: formData.get("student_name"),
          email: formData.get("email"),
          description: formData.get("description"),
          amount: formData.get("amount"),
          due_date: formData.get("due_date"),
          created_by: user.first_name || user.email || "Treasury",
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "Failed to create billing");
      return;
    }

    form.reset();
    renderBillingBreakdown(0);
    alert(
      "Billing breakdown created successfully: downpayment plus 1st to 4th payment.",
    );
    await loadBillings();
  });
}

async function readApiResponse(response) {
  const raw = await response.text();

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return {
      error: raw,
    };
  }
}

function initSearch() {
  const searchBox = document.querySelector(".search-box");

  searchBox.addEventListener("input", () => {
    loadBillings(searchBox.value);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initBillingFilterTabs();
  setBillingFilter("paid");
  initSearch();
  await initCreateBilling();
  await loadBillings();
});
