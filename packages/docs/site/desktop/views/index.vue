<script setup>
defineOptions({
  meta: {
    title: "首页",
    showAnchor: false,
    headerShadow: false,
  },
});
</script>

<template>
  <div class="home">
    <!-- ====== Hero 区域 ====== -->
    <section class="hero">
      <div class="hero-grid"></div>
      <div class="hero-glow hero-glow-1"></div>
      <div class="hero-glow hero-glow-2"></div>
      <div class="hero-glow hero-glow-3"></div>

      <div class="hero-inner">
        <div class="hero-logo">
          <img
            src="/logo.svg"
            alt=""
          />
          <span>dsh-workbench</span>
        </div>

        <h1 class="hero-title">
          <span class="line">给 DeepSeek Harness</span>
          <span class="line">换一个<span class="grad">外壳</span></span>
        </h1>

        <p class="hero-desc">
          一个 dsh 插件：左边认领项目与会话，中间那列一直是对话，<br />
          右边是自研的数据面板。界面只读，写入只走 agent 工具。
        </p>

        <div class="hero-cta">
          <a
            href="#/guide/quickstart"
            target="_blank"
            class="btn-primary"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line
                x1="12"
                y1="15"
                x2="12"
                y2="3"
              />
            </svg>
            30 秒开始
          </a>
          <PagodaDocLinkToView
            view="guide/quickstart"
            class="btn-ghost"
          >
            看架构
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M5 12h14" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </PagodaDocLinkToView>
        </div>

        <div class="hero-meta">
          <div class="meta-item">
            <span
              class="meta-dot"
              style="--c: var(--purple)"
            ></span>
            dsh ≥ 0.2.1-rc.2
          </div>
          <div class="meta-sep"></div>
          <div class="meta-item">
            <span
              class="meta-dot"
              style="--c: var(--cyan)"
            ></span>
            独立实例 :3081
          </div>
          <div class="meta-sep"></div>
          <div class="meta-item">
            <span
              class="meta-dot"
              style="--c: #10b981"
            ></span>
            完全开源 · MIT
          </div>
        </div>
      </div>
    </section>

    <!-- ====== 核心能力 ====== -->
    <section class="features">
      <div class="section-header">
        <span class="section-eyebrow">FEATURES</span>
        <h2>核心能力</h2>
        <p>一个 dsh 插件：左栏、常驻对话、只读面板</p>
      </div>

      <div class="feature-grid">
        <div class="f-card">
          <div
            class="f-icon"
            style="--c: var(--purple)"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="3"
              />
              <line
                x1="3"
                y1="9"
                x2="21"
                y2="9"
              />
              <line
                x1="9"
                y1="21"
                x2="9"
                y2="9"
              />
            </svg>
          </div>
          <h3>左栏：项目与会话</h3>
          <p>工作区、会话、任务收在一列，切回来还是那个现场。</p>
        </div>
        <div class="f-card">
          <div
            class="f-icon"
            style="--c: var(--indigo)"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
            </svg>
          </div>
          <h3>中间：常驻对话</h3>
          <p>对话不藏在抽屉里，和面板并排，不用来回切上下文。</p>
        </div>
        <div class="f-card">
          <div
            class="f-icon"
            style="--c: var(--cyan)"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h3>右侧：只读面板</h3>
          <p>面板只读，写入只走 agent 工具；出现写接口就是设计错了。</p>
        </div>
        <div class="f-card">
          <div
            class="f-icon"
            style="--c: #10b981"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h3>三种装法</h3>
          <p>独立实例、装进 dsh web、装进 Desktop；要隔离就隔离。</p>
        </div>
        <div class="f-card">
          <div
            class="f-icon"
            style="--c: #f59e0b"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <rect
                x="2"
                y="3"
                width="20"
                height="14"
                rx="2"
              />
              <line
                x1="8"
                y1="21"
                x2="16"
                y2="21"
              />
              <line
                x1="12"
                y1="17"
                x2="12"
                y2="21"
              />
            </svg>
          </div>
          <h3>模块按需</h3>
          <p>缺陷、构建、分析都是独立模块，市场里装升卸，或让 agent 代劳。</p>
        </div>
        <div class="f-card">
          <div
            class="f-icon"
            style="--c: #f43f5e"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
              />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h3>门禁守得住</h3>
          <p>零注释、两个运行时不许互引、面板只读 —— 每条硬约束都有判据在链上跑。</p>
        </div>
      </div>
    </section>

    <!-- ====== 快速开始 ====== -->
    <section class="quickstart">
      <div class="section-header">
        <span class="section-eyebrow">GET STARTED</span>
        <h2>开始使用</h2>
        <p>三分钟跑起来：装、起、装模块，别的它自己准备</p>
      </div>

      <div class="qs-entry">
        <div class="qs-card">
          <div
            class="qs-card-icon"
            style="--c: var(--purple)"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
            </svg>
          </div>
          <h3>快速开始</h3>
          <p>npx 一条命令建实例，浏览器打开 :3081，与 dsh web 并存。</p>
          <PagodaDocLinkToView
            view="guide/quickstart"
            class="qs-link"
          >查看完整教程 →</PagodaDocLinkToView>
        </div>
        <div class="qs-card">
          <div
            class="qs-card-icon"
            style="--c: var(--cyan)"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
              />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line
                x1="12"
                y1="17"
                x2="12.01"
                y2="17"
              />
            </svg>
          </div>
          <h3>常见问题</h3>
          <p>起不来、面板空、装进 Desktop 没反应？按症状找答案。</p>
          <PagodaDocLinkToView
            view="faq"
            class="qs-link"
          >查看常见问题 →</PagodaDocLinkToView>
        </div>
      </div>
    </section>

    <!-- ====== 底部 ====== -->
    <section class="footer-cta">
      <div class="footer-cta-inner">
        <h2>先装上，再决定要不要留下</h2>
        <p>独立实例与 dsh web 并存，装错了删掉数据目录就回到原样</p>
        <a
          href="#/guide/quickstart"
          class="btn-primary"
        >
          看快速开始
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path d="M5 12h14" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
      </div>
    </section>
  </div>
</template>

<style>
/* ====== 基础变量 ====== */
.home {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 32px;
  box-sizing: border-box;
  --bg: #0a0a14;
  --bg-elevated: #11111c;
  --border: rgba(255, 255, 255, 0.06);
  --border-hover: rgba(255, 255, 255, 0.12);
  --text-1: #f1f5f9;
  --text-2: #cbd5e1;
  --text-3: #94a3b8;
  --text-4: #64748b;
  --text-5: #475569;
  --purple: #b39aff;
  --indigo: #818cf8;
  --cyan: #06b6d4;
  --emerald: #10b981;
  --rose: #f43f5e;
  --amber: #f59e0b;
}

/* ====== Hero ====== */
.hero {
  position: relative;
  padding: 120px 0 100px;
  text-align: center;
  overflow: hidden;
  isolation: isolate;
  margin: 0 -32px;
}

.hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, #000 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, #000 30%, transparent 80%);
  z-index: -2;
}

.hero-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  z-index: -1;
  pointer-events: none;
}

.hero-glow-1 {
  width: 500px;
  height: 500px;
  background: var(--purple);
  top: -200px;
  left: 20%;
  opacity: 0.18;
}

.hero-glow-2 {
  width: 400px;
  height: 400px;
  background: var(--cyan);
  top: 50px;
  right: 15%;
  opacity: 0.12;
}

.hero-glow-3 {
  width: 350px;
  height: 350px;
  background: var(--indigo);
  bottom: -100px;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0.15;
}

.hero-inner {
  position: relative;
  z-index: 1;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 24px;
}

.hero-logo img {
  display: block;
  width: 22px;
  height: 22px;
}

.hero-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px 6px 8px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 32px;
}

.hero-title {
  font-size: clamp(40px, 6vw, 68px);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin: 0 0 28px;
  color: var(--text-1);
}

.hero-title .line {
  display: block;
}

.hero-title .grad {
  background: linear-gradient(135deg, var(--purple) 0%, var(--indigo) 40%, #22d3ee 80%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 800;
  display: inline-block;
  padding: 0 0.15em;
  line-height: 1.3;
  margin: 0 -0.1em;
}

.hero-desc {
  font-size: 17px;
  line-height: 1.7;
  color: var(--text-3);
  max-width: 540px;
  margin: 0 auto 40px;
}

.hero-cta {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 56px;
  flex-wrap: wrap;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--text-1);
  color: #0a0a14;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  text-decoration: none;
  transition: all 0.2s;
  border-bottom: none !important;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.1) inset,
    0 8px 24px rgba(255, 255, 255, 0.06);
}

.btn-primary:hover {
  transform: translateY(-1px);
  background: #fff;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.1) inset,
    0 12px 32px rgba(255, 255, 255, 0.12);
}

.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 22px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-2);
  font-size: 14px;
  font-weight: 500;
  border-radius: 10px;
  text-decoration: none;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-1);
  border-color: rgba(255, 255, 255, 0.15);
}

.hero-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--text-4);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 8px var(--c);
}

.meta-sep {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.08);
}

/* ====== 通用 Section ====== */
.features,
.download,
.quickstart {
  padding: 80px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.section-header {
  text-align: center;
  margin-bottom: 48px;
}

.section-eyebrow {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-5);
  letter-spacing: 0.15em;
  margin-bottom: 12px;
}

.section-header h2 {
  font-size: 36px !important;
  font-weight: 700 !important;
  color: var(--text-1) !important;
  margin: 0 0 12px !important;
  letter-spacing: -0.02em;
}

.section-header p {
  font-size: 15px !important;
  color: var(--text-4) !important;
  margin: 0 !important;
}

/* ====== 特性卡片 ====== */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
}

.f-card {
  position: relative;
  padding: 32px 28px;
  background: var(--bg);
  transition: background 0.3s;
}

.f-card:hover {
  background: var(--bg-elevated);
}

.f-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, transparent);
  margin-bottom: 24px;
}

.f-card h3 {
  font-size: 15px !important;
  font-weight: 600 !important;
  color: var(--text-1) !important;
  margin: 0 0 8px !important;
  letter-spacing: -0.01em;
}

.f-card p {
  font-size: 13.5px !important;
  color: var(--text-4) !important;
  line-height: 1.6 !important;
  margin: 0 !important;
}

/* ====== 下载区 ====== */
.download-card {
  position: relative;
  max-width: 720px;
  margin: 0 auto 32px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  overflow: hidden;
  isolation: isolate;
}

.download-card-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 0% 0%, rgba(168, 85, 247, 0.15), transparent 50%),
    radial-gradient(circle at 100% 100%, rgba(6, 182, 212, 0.12), transparent 50%);
  z-index: -1;
}

.download-card-content {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 28px 32px;
}

.download-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(179, 154, 255, 0.2), rgba(129, 140, 241, 0.15));
  color: var(--purple);
  border: 1px solid rgba(179, 154, 255, 0.2);
}

.download-info {
  flex: 1;
}

.download-info h3 {
  font-size: 17px !important;
  font-weight: 600 !important;
  color: var(--text-1) !important;
  margin: 0 0 4px !important;
  letter-spacing: -0.01em;
}

.download-info p {
  font-size: 13.5px !important;
  color: var(--text-4) !important;
  margin: 0 !important;
}

.download-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: var(--text-1);
  color: #0a0a14;
  font-size: 13.5px;
  font-weight: 600;
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.2s;
  flex-shrink: 0;
  border-bottom: none !important;
}

.download-btn:hover {
  background: #fff;
  transform: translateY(-1px);
}

.browser-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 720px;
  margin: 0 auto;
}

.browser-item {
  padding: 6px 14px;
  font-size: 12.5px;
  color: var(--text-5);
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
}

.browser-item.active {
  color: var(--text-2);
  background: rgba(168, 85, 247, 0.1);
  border-color: rgba(168, 85, 247, 0.25);
}

/* ====== 快速开始 ====== */
.qs-entry {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  max-width: 720px;
  margin: 0 auto;
}

.qs-card {
  position: relative;
  padding: 32px 28px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  transition: all 0.3s;
}

.qs-card:hover {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
}

.qs-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, transparent);
  margin-bottom: 20px;
}

.qs-card h3 {
  font-size: 16px !important;
  font-weight: 600 !important;
  color: var(--text-1) !important;
  margin: 0 0 8px !important;
}

.qs-card p {
  font-size: 14px !important;
  color: var(--text-3) !important;
  line-height: 1.6 !important;
  margin: 0 0 20px !important;
}

.qs-link {
  margin-top: auto;
  color: var(--text-2) !important;
  font-size: 13.5px;
  text-decoration: none !important;
  border-bottom: none !important;
  transition: color 0.2s;
}

.qs-link:hover {
  color: var(--purple) !important;
}

/* ====== 底部 CTA ====== */
.footer-cta {
  padding: 100px 0 80px;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  position: relative;
  overflow: hidden;
}

.footer-cta::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  width: 600px;
  height: 300px;
  background: radial-gradient(ellipse, rgba(168, 85, 247, 0.1), transparent 60%);
  transform: translate(-50%, -50%);
  z-index: -1;
}

.footer-cta-inner h2 {
  font-size: 32px !important;
  font-weight: 700 !important;
  color: var(--text-1) !important;
  line-height: 1.3 !important;
  margin: 0 0 12px !important;
  letter-spacing: -0.02em;
}

.footer-cta-inner p {
  font-size: 15px !important;
  color: var(--text-4) !important;
  margin: 0 0 28px !important;
}

/* ====== 响应式 ====== */
@media (max-width: 1024px) {
  .feature-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .home {
    padding: 0 16px;
  }

  .hero {
    padding: 80px 0 60px;
    margin: 0 -16px;
  }

  .hero-title {
    font-size: 40px;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .download-card-content {
    flex-direction: column;
    text-align: center;
  }

  .section-header h2 {
    font-size: 28px !important;
  }

  .browser-row {
    padding: 0 16px;
  }
}
</style>