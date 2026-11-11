/* 设置密码（D-0093）：链接里 # 后面是一次性令牌——放在 # 后面，浏览器不会把它发给服务器的日志或别的网站 */
(() => {
  const form = document.getElementById("form");
  const button = document.getElementById("submit");
  const message = document.getElementById("message");
  const token = location.hash.slice(1);
  if (!token) {
    message.textContent = "链接不完整，请重新打开设置链接";
    button.disabled = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    if (password !== String(data.get("confirm") || "")) {
      message.textContent = "两次输入的密码不一样";
      return;
    }
    button.disabled = true;
    message.textContent = "";
    try {
      const response = await fetch("/__myoutside/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        history.replaceState(null, "", "/__myoutside/setup");
        location.href = "/";
        return;
      }
      message.textContent = body.error || `保存失败（${response.status}）`;
    } catch {
      message.textContent = "连不上服务器，请检查网络";
    }
    button.disabled = false;
  });
})();
