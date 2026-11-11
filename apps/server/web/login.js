/* 登录页（D-0093）：输错多了要等一会儿再试，但账号不会被锁 */
(() => {
  const form = document.getElementById("form");
  const button = document.getElementById("submit");
  const message = document.getElementById("message");
  let timer = null;

  function wait(ms, text) {
    clearInterval(timer);
    const until = Date.now() + ms;
    button.disabled = true;
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(timer);
        button.disabled = false;
        message.textContent = text;
        return;
      }
      message.textContent = `${text}（${left} 秒后可以再试）`;
    };
    tick();
    timer = setInterval(tick, 250);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const data = new FormData(form);
    button.disabled = true;
    message.textContent = "";
    try {
      const response = await fetch("/__myoutside/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        location.href = "/";
        return;
      }
      const text = body.error || `登录失败（${response.status}）`;
      if (body.retryAfterMs > 0) {
        wait(body.retryAfterMs, text);
        return;
      }
      message.textContent = text;
    } catch {
      message.textContent = "连不上服务器，请检查网络";
    }
    button.disabled = false;
  });
})();
