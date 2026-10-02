/* MyOutside 外壳：应用列表 + 面板区（v0） */

const appsEl = document.getElementById("apps");
const panel = document.getElementById("panel");
const versionEl = document.getElementById("version");

let bootstrapped = false;

function setActive(button) {
  for (const el of document.querySelectorAll(".app-item")) {
    el.classList.toggle("active", el === button);
  }
}

async function loadApps() {
  try {
    const res = await window.outside.call("platform.listApps", {});
    if (!res.ok) throw new Error(res.error.message);
    const apps = res.result ?? [];
    appsEl.innerHTML = "";
    if (apps.length === 0) {
      appsEl.innerHTML = '<div class="empty">没有已安装的子应用</div>';
      return;
    }
    for (const app of apps) {
      const button = document.createElement("button");
      button.className = "app-item";
      button.textContent = app.name;
      button.addEventListener("click", () => {
        panel.src = `app://${app.id}/index.html`;
        setActive(button);
      });
      appsEl.appendChild(button);
    }
    if (!bootstrapped) {
      bootstrapped = true;
      const first = appsEl.querySelector(".app-item");
      if (first) first.click();
    }
  } catch (error) {
    appsEl.innerHTML = `<div class="empty">加载失败：${String(error)}</div>`;
  }
}

async function refreshVersion() {
  try {
    const res = await window.outside.call("platform.dataVersion", {});
    if (res.ok) versionEl.textContent = `数据版本 ${res.result}`;
  } catch {
    /* 忽略 */
  }
}

loadApps();
refreshVersion();
setInterval(refreshVersion, 3000);
