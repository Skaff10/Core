const state = {
  authToken: "",
  pinCode: "",
  logCount: 0,
  ws: null,
};

const els = {
  hostReadout: document.getElementById("host-readout"),
  lanIpDisplay: document.getElementById("lan-ip-display"),
  wsStatusDot: document.getElementById("ws-status-dot"),
  wsStatusText: document.getElementById("ws-status-text"),
  pinValue: document.getElementById("pin-value"),
  tokenValue: document.getElementById("token-value"),
  rotateTokenBtn: document.getElementById("rotate-token-btn"),
  actionCount: document.getElementById("action-count"),
  actionForm: document.getElementById("action-form"),
  actionName: document.getElementById("action-name"),
  actionIcon: document.getElementById("action-icon"),
  actionCommand: document.getElementById("action-command"),
  actionsTbody: document.getElementById("actions-tbody"),
  pathCount: document.getElementById("path-count"),
  pathForm: document.getElementById("path-form"),
  whitelistPathInput: document.getElementById("whitelist-path-input"),
  pathsTbody: document.getElementById("paths-tbody"),
  logTerminal: document.getElementById("log-terminal"),
  logLineCounter: document.getElementById("log-line-counter"),
  clearLogsBtn: document.getElementById("clear-logs-btn"),
  testPingBtn: document.getElementById("test-ping-btn"),
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchAdminState() {
  const res = await fetch("/api/admin/state");
  if (!res.ok) {
    throw new Error(`Failed loading admin state: ${res.status}`);
  }
  const data = await res.json();
  state.authToken = data.auth_token;
  state.pinCode = data.pin_code;

  els.hostReadout.textContent = `NODE: ${data.hostname.toUpperCase()} // LOCAL CONTROL PANEL`;
  els.lanIpDisplay.textContent = `${data.lan_ip}:${data.port}`;
  els.pinValue.textContent = data.pin_code;
  els.tokenValue.textContent = data.auth_token;

  renderActions(data.quick_actions);
  renderPaths(data.whitelisted_paths);
}

function renderActions(actions) {
  els.actionCount.textContent = `${actions.length} REGISTERED`;
  if (!actions.length) {
    els.actionsTbody.innerHTML = `<tr><td colspan="4" class="mono" style="color: var(--text-muted);">No Quick Actions configured.</td></tr>`;
    return;
  }

  els.actionsTbody.innerHTML = actions
    .map(
      (act) => `
    <tr>
      <td style="font-weight: 600;">${escapeHtml(act.name)}</td>
      <td><span class="tag">${escapeHtml(act.icon)}</span></td>
      <td class="mono" style="color: var(--text-secondary);">${escapeHtml(act.command)}</td>
      <td class="col-right">
        <div class="row-controls">
          <button class="btn-inline" onclick="testAction('${escapeHtml(act.id)}')">RUN TEST</button>
          <button class="btn btn-danger" onclick="deleteAction('${escapeHtml(act.id)}')">REMOVE</button>
        </div>
      </td>
    </tr>
  `
    )
    .join("");
}

function renderPaths(paths) {
  els.pathCount.textContent = `${paths.length} PATHS`;
  if (!paths.length) {
    els.pathsTbody.innerHTML = `<tr><td colspan="3" class="mono" style="color: var(--text-muted);">No directories whitelisted.</td></tr>`;
    return;
  }

  els.pathsTbody.innerHTML = paths
    .map((item) => {
      const badge = item.exists
        ? `<span class="tag tag-ok">VERIFIED</span>`
        : `<span class="tag tag-warn">MISSING ON DISK</span>`;
      const encodedPath = encodeURIComponent(item.path);
      return `
      <tr>
        <td class="mono">${escapeHtml(item.path)}</td>
        <td>${badge}</td>
        <td class="col-right">
          <button class="btn btn-danger" onclick="deletePath('${encodedPath}')">REVOKE</button>
        </td>
      </tr>
    `;
    })
    .join("");
}

async function testAction(actionId) {
  await fetch("/api/admin/actions/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action_id: actionId }),
  });
}

async function deleteAction(actionId) {
  await fetch(`/api/admin/actions/${encodeURIComponent(actionId)}`, {
    method: "DELETE",
  });
  await fetchAdminState();
}

async function deletePath(encodedPath) {
  await fetch(`/api/admin/paths?path=${encodedPath}`, {
    method: "DELETE",
  });
  await fetchAdminState();
}

window.testAction = testAction;
window.deleteAction = deleteAction;
window.deletePath = deletePath;

els.actionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: els.actionName.value.trim(),
    icon: els.actionIcon.value.trim() || "terminal",
    command: els.actionCommand.value.trim(),
  };
  const res = await fetch("/api/admin/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    els.actionName.value = "";
    els.actionCommand.value = "";
    await fetchAdminState();
  }
});

els.pathForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const rawPath = els.whitelistPathInput.value.trim();
  if (!rawPath) return;

  const res = await fetch("/api/admin/paths", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: rawPath }),
  });
  if (res.ok) {
    els.whitelistPathInput.value = "";
    await fetchAdminState();
  }
});

els.rotateTokenBtn.addEventListener("click", async () => {
  const res = await fetch("/api/admin/token/rotate", { method: "POST" });
  if (res.ok) {
    await fetchAdminState();
  }
});

els.testPingBtn.addEventListener("click", async () => {
  await fetch("/api/system/ping", {
    headers: { Authorization: `Bearer ${state.authToken}` },
  });
});

els.clearLogsBtn.addEventListener("click", () => {
  els.logTerminal.innerHTML = "";
  state.logCount = 0;
  els.logLineCounter.textContent = "0 EVENTS";
});

document.querySelectorAll("[data-copy-target]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.getAttribute("data-copy-target");
    const text = document.getElementById(targetId)?.textContent || "";
    navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = "COPIED";
    setTimeout(() => {
      btn.textContent = original;
    }, 1000);
  });
});

function appendLogEntry(entry) {
  const row = document.createElement("div");
  row.className = `log-entry level-${entry.level}`;
  const metaHtml = entry.meta ? `<span class="log-meta">[${escapeHtml(entry.meta)}]</span>` : "";
  row.innerHTML = `
    <span class="log-ts">${escapeHtml(entry.timestamp)}</span>
    <span class="log-lvl">${escapeHtml(entry.level)}</span>
    <span class="log-src">${escapeHtml(entry.source)}</span>
    <span class="log-msg">${escapeHtml(entry.message)}${metaHtml}</span>
  `;
  els.logTerminal.appendChild(row);
  els.logTerminal.scrollTop = els.logTerminal.scrollHeight;
  state.logCount += 1;
  els.logLineCounter.textContent = `${state.logCount} EVENTS`;
}

function connectLogStream() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/logs`;
  const ws = new WebSocket(wsUrl);
  state.ws = ws;

  ws.onopen = () => {
    els.wsStatusDot.className = "status-dot online";
    els.wsStatusText.textContent = "STREAM LINKED";
  };

  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "log" && payload.data) {
        appendLogEntry(payload.data);
      }
    } catch (err) {
      console.error("Failed parsing WS message", err);
    }
  };

  ws.onclose = () => {
    els.wsStatusDot.className = "status-dot offline";
    els.wsStatusText.textContent = "DISCONNECTED (RETRYING)";
    setTimeout(connectLogStream, 2000);
  };
}

(async function init() {
  await fetchAdminState();
  connectLogStream();
})();

