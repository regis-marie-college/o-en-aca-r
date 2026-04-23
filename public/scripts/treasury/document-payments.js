"use strict";

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

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value || 0));
}

async function loadRequests() {
  const currentUser = auth();
  const response = await fetch(
    `${window.APP_CONFIG.API_BASE_URL}/document_requests/list`,
  );
  const data = await response.json();
  const tbody = document.querySelector("#table-document-payments tbody");
  tbody.innerHTML = "";

  data.forEach((request) => {
    const canReview =
      currentUser?.type === "treasury" &&
      request.payment_method === "Online" &&
      request.payment_status === "Submitted";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(request.student_name)}<br /><small>${escapeHtml(request.email)}</small></td>
      <td>${escapeHtml(request.document_type)}</td>
      <td>${escapeHtml(request.payment_method || "-")}</td>
      <td>${escapeHtml(request.reference_no || "-")}</td>
      <td>${formatCurrency(request.amount)}</td>
      <td>${renderProofCell(request.proof_of_payment)}</td>
      <td>${escapeHtml(request.payment_status)}</td>
      <td>${escapeHtml(request.request_status)}</td>
      <td>
        ${
          canReview
            ? `
              <button type="button" class="btn btn-primary btn-sm btn-payment-action" data-id="${request.id}" data-status="Approved">Approve</button>
              <button type="button" class="btn btn-danger btn-sm btn-payment-action" data-id="${request.id}" data-status="Denied">Deny</button>
            `
            : escapeHtml(
                request.payment_method === "Cash"
                  ? "Auto Approved"
                  : request.payment_status === "Submitted"
                    ? "For Treasury Review"
                    : "-",
              )
        }
      </td>
    `;
    tbody.appendChild(row);
  });

  bindActions();
}

function bindActions() {
  document.querySelectorAll(".btn-payment-action").forEach((button) => {
    button.addEventListener("click", async () => {
      const user = auth() || {};
      const nextStatus = button.dataset.status;
      const nextRequestStatus =
        nextStatus === "Approved" ? "Payment Approved" : "Payment Rejected";

      const response = await fetch(
        `${window.APP_CONFIG.API_BASE_URL}/document_requests/update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: button.dataset.id,
            payment_status: nextStatus,
            request_status: nextRequestStatus,
            notes:
              nextStatus === "Approved"
                ? `Approved by ${user.email || user.first_name || "Treasury"}`
                : `Rejected by ${user.email || user.first_name || "Treasury"}`,
            treasury_reviewed_by: user.email || user.first_name || "Treasury",
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Failed to review payment");
        return;
      }

      await loadRequests();
    });
  });
}

document.addEventListener("DOMContentLoaded", loadRequests);
