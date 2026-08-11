/**
 * src/lib/richComponents.ts
 *
 * Smart "lazy" CSS + JS injection for rich article components.
 *
 * Philosophy:
 *   - MCQ/Quiz, Table, Video CSS/JS are ONLY embedded into the article body
 *     when those components actually exist in the content.
 *   - Main blog theme never loads unused CSS (no PageSpeed "unused CSS" warning).
 *   - Each block is self-contained: a <style> + optional <script> injected at the
 *     BOTTOM of the article markdown/html — so it survives all 3 editor tabs and
 *     is published as-is to GitHub.
 */

// ─── MCQ / Quiz CSS ──────────────────────────────────────────────────────────

export const MCQ_STYLE_MARKER = '<!-- tsa-mcq-styles -->';
export const TABLE_STYLE_MARKER = '<!-- tsa-table-styles -->';
export const VIDEO_STYLE_MARKER = '<!-- tsa-video-styles -->';

export const MCQ_CSS = `${MCQ_STYLE_MARKER}
<style>
/* The Smart Advice MCQ Quiz Component — Self-Contained */
.tsa-quiz-wrap {
  margin: 2.5rem 0;
  padding: 1.5rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
  font-family: inherit;
}
.tsa-quiz-header {
  font-size: 1.4rem;
  font-weight: 800;
  margin-bottom: 1.5rem;
  color: #1e293b;
  border-left: 4px solid #1a73e8;
  padding-left: 10px;
}
.tsa-progress-container {
  margin: 1.5rem 0;
  width: 100%;
  height: 20px;
  background-color: #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
}
.tsa-progress-bar {
  width: 0;
  height: 100%;
  background: linear-gradient(90deg, #1a73e8, #34a853);
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.tsa-percentage {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 800;
  color: #1e293b;
  line-height: 20px;
}
.tsa-divider {
  border: 0;
  height: 1px;
  background: #e2e8f0;
  margin: 1.5rem 0;
}
.tsa-question {
  font-size: 1.05rem;
  font-weight: 600;
  margin-bottom: 12px;
  color: #1e293b;
  line-height: 1.6;
}
.tsa-option {
  display: flex;
  align-items: center;
  margin: 8px 0;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 0.95rem;
  color: #475569;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  transition: all 0.2s ease;
  line-height: 1.4;
}
.tsa-option::before {
  content: "";
  display: inline-block;
  width: 18px;
  height: 18px;
  margin-right: 12px;
  border: 2px solid #cbd5e1;
  border-radius: 50%;
  flex-shrink: 0;
  background: transparent center/70% no-repeat;
  transition: all 0.2s ease;
}
.tsa-option:hover:not(.tsa-answered) {
  color: #1a73e8;
  border-color: #1a73e8;
  background: #f0f7ff;
}
.tsa-option:hover:not(.tsa-answered)::before {
  border-color: #1a73e8;
}
.tsa-option.tsa-correct {
  color: #155724 !important;
  border-color: #52c41a !important;
  background: #f6ffed !important;
  font-weight: 600;
}
.tsa-option.tsa-correct::before {
  background-color: #52c41a !important;
  border-color: #52c41a !important;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'/></svg>") !important;
}
.tsa-option.tsa-wrong {
  color: #721c24 !important;
  border-color: #ff4d4f !important;
  background: #fff2f0 !important;
  font-weight: 600;
}
.tsa-option.tsa-wrong::before {
  background-color: #ff4d4f !important;
  border-color: #ff4d4f !important;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'/></svg>") !important;
}
.tsa-option.tsa-answered {
  cursor: default;
  pointer-events: none;
}
.tsa-exp {
  margin: 12px 0;
  display: none;
  padding: 12px 16px;
  background-color: #fffbe6;
  border-left: 4px solid #ffe58f;
  border-radius: 4px;
  font-size: 0.92rem;
  color: #595959;
  line-height: 1.6;
}
.tsa-reset-btn {
  background-color: #ff4d4f;
  color: #fff;
  padding: 10px 28px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  display: block;
  width: fit-content;
  margin: 24px auto;
  box-shadow: 0 4px 10px rgba(255, 77, 79, 0.2);
  transition: all 0.3s;
}
.tsa-reset-btn:hover {
  background-color: #d9363e;
  transform: translateY(-1px);
}
.tsa-report-card {
  margin-top: 28px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
}
.tsa-report-card h3 {
  margin: 0;
  padding: 16px 20px;
  background: linear-gradient(135deg, #1a73e8, #6366f1);
  color: #ffffff !important;
  font-size: 1rem;
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-align: center;
}
.tsa-report-card .tsa-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  padding: 0;
}
.tsa-report-card .tsa-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 12px 18px;
  border-right: 1px solid #f1f5f9;
  position: relative;
}
.tsa-report-card .tsa-stat-item:last-child {
  border-right: none;
}
.tsa-report-card .tsa-stat-icon {
  width: 36px;
  height: 36px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tsa-report-card .tsa-stat-value {
  font-size: 1.75rem;
  font-weight: 800;
  color: #1e293b;
  line-height: 1.2;
  display: block;
}
.tsa-report-card .tsa-stat-value.tsa-val-correct {
  color: #16a34a;
}
.tsa-report-card .tsa-stat-value.tsa-val-wrong {
  color: #dc2626;
}
.tsa-report-card .tsa-stat-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
  margin-top: 4px;
  display: block;
}
#tsa-message {
  display: block;
  text-align: center;
  padding: 14px 20px;
  margin: 0;
  background: linear-gradient(135deg, #eff6ff, #f0fdf4);
  color: #1a73e8;
  font-weight: 800;
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  border-top: 1px solid #e2e8f0;
}
@media (max-width: 480px) {
  .tsa-report-card .tsa-stats-grid {
    grid-template-columns: 1fr;
  }
  .tsa-report-card .tsa-stat-item {
    border-right: none;
    border-bottom: 1px solid #f1f5f9;
    padding: 14px 12px;
    flex-direction: row;
    gap: 10px;
    justify-content: center;
  }
  .tsa-report-card .tsa-stat-item:last-child {
    border-bottom: none;
  }
  .tsa-report-card .tsa-stat-icon {
    margin-bottom: 0;
    width: 28px;
    height: 28px;
  }
  .tsa-report-card .tsa-stat-icon svg {
    width: 28px;
    height: 28px;
  }
  .tsa-report-card .tsa-stat-value {
    font-size: 1.3rem;
  }
  .tsa-report-card .tsa-stat-label {
    margin-top: 0;
  }
}

/* Dark Mode Styles (.drK support) */
.drK .tsa-quiz-wrap {
  background: #1e1e1f;
  border-color: #2e2e30;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}
.drK .tsa-quiz-header {
  color: #f5f5f5;
}
.drK .tsa-progress-container {
  background-color: #303031;
}
.drK .tsa-percentage {
  color: #f5f5f5;
}
.drK .tsa-question {
  color: #f5f5f5;
}
.drK .tsa-option {
  background: #252526;
  border-color: #3e3e40;
  color: #ccc;
}
.drK .tsa-option:hover:not(.tsa-answered) {
  color: #1a73e8;
  border-color: #1a73e8;
  background: #1c2a3a;
}
.drK .tsa-option.tsa-correct {
  color: #81c784 !important;
  border-color: #389e0d !important;
  background: #132510 !important;
}
.drK .tsa-option.tsa-wrong {
  color: #e57373 !important;
  border-color: #cf1322 !important;
  background: #2b1311 !important;
}
.drK .tsa-exp {
  background-color: #2b2612;
  border-left-color: #d4b106;
  color: #ccc;
}
.drK .tsa-report-card {
  background-color: #1e1e1f;
  border-color: #2e2e30;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}
.drK .tsa-report-card h3 {
  background: linear-gradient(135deg, #1a5fc7, #5355d4);
}
.drK .tsa-report-card .tsa-stat-item {
  border-right-color: #2e2e30;
}
.drK .tsa-report-card .tsa-stat-value {
  color: #f5f5f5;
}
.drK .tsa-report-card .tsa-stat-value.tsa-val-correct {
  color: #4ade80;
}
.drK .tsa-report-card .tsa-stat-value.tsa-val-wrong {
  color: #f87171;
}
.drK .tsa-report-card .tsa-stat-label {
  color: #64748b;
}
.drK #tsa-message {
  background: linear-gradient(135deg, #1a2332, #162016);
  border-top-color: #2e2e30;
  color: #60a5fa;
}
.drK .tsa-divider {
  background: #3e<script>
(function(){
  function initSmartAdviceQuiz(){
    document.querySelectorAll(".tsa-quiz-wrap").forEach(function(wrap) {
      if (wrap._tsaInit) return;
      wrap._tsaInit = true;

      const options = wrap.querySelectorAll(".tsa-option");
      const progressBar = wrap.querySelector(".tsa-progress-bar");
      const percentage = wrap.querySelector(".tsa-percentage");
      const attemptedCount = wrap.querySelector("#tsa-attemptedCount");
      const correctCount = wrap.querySelector("#tsa-correctCount");
      const wrongCount = wrap.querySelector("#tsa-wrongCount");
      const message = wrap.querySelector("#tsa-message");
      const resetButton = wrap.querySelector(".tsa-reset-btn");

      if (options.length === 0) return;

      const totalQuestions = new Set(Array.from(options).map(opt => opt.getAttribute("data-question"))).size;
      let attempted = 0;
      let correct = 0;

      options.forEach(opt => {
        let newOpt = opt.cloneNode(true);
        opt.parentNode.replaceChild(newOpt, opt);

        newOpt.addEventListener("click", function() {
          const qId = this.getAttribute("data-question");
          const isCorrect = this.getAttribute("data-correct") === "true";
          const siblingOpts = wrap.querySelectorAll(`.tsa-option[data-question="${qId}"]`);

          const alreadyAnswered = Array.from(siblingOpts).some(o => o.classList.contains("tsa-answered"));
          if (alreadyAnswered) return;

          attempted++;
          siblingOpts.forEach(o => o.classList.add("tsa-answered"));

          if (isCorrect) {
            correct++;
            this.classList.add("tsa-correct");
          } else {
            this.classList.add("tsa-wrong");
            siblingOpts.forEach(o => {
              if (o.getAttribute("data-correct") === "true") {
                o.classList.add("tsa-correct");
              }
            });
          }

          const exp = wrap.querySelector(`.tsa-exp[data-question="${qId}"]`);
          if (exp) exp.style.display = "block";

          if (attemptedCount) attemptedCount.textContent = attempted;
          if (correctCount) correctCount.textContent = correct;
          if (wrongCount) wrongCount.textContent = attempted - correct;

          if (progressBar && percentage) {
            const pct = (attempted / totalQuestions) * 100;
            progressBar.style.width = pct + "%";
            percentage.textContent = Math.round(pct) + "%";
          }

          if (attempted === totalQuestions && message) {
            if (correct === totalQuestions) {
              message.textContent = "CONGRATULATIONS! YOU GOT ALL CORRECT!";
            } else if (correct >= totalQuestions / 2) {
              message.textContent = "GREAT JOB! YOU'RE DOING WELL!";
            } else {
              message.textContent = "KEEP PRACTICING. YOU CAN IMPROVE!";
            }
          }
        });
      });

      if (resetButton) {
        let newReset = resetButton.cloneNode(true);
        resetButton.parentNode.replaceChild(newReset, resetButton);

        newReset.addEventListener("click", function() {
          wrap.querySelectorAll(".tsa-option").forEach(o => {
            o.classList.remove("tsa-correct", "tsa-wrong", "tsa-answered");
          });
          wrap.querySelectorAll(".tsa-exp").forEach(e => {
            e.style.display = "none";
          });

          attempted = 0;
          correct = 0;

          if (attemptedCount) attemptedCount.textContent = "0";
          if (correctCount) correctCount.textContent = "0";
          if (wrongCount) wrongCount.textContent = "0";
          if (progressBar) progressBar.style.width = "0%";
          if (percentage) percentage.textContent = "0%";
          if (message) message.textContent = "PRACTICE REGULARLY!";
        });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSmartAdviceQuiz);
  } else {
    initSmartAdviceQuiz();
  }
})();
</script>`;

// ─── TABLE CSS ───────────────────────────────────────────────────────────────

export const TABLE_CSS = `${TABLE_STYLE_MARKER}
<style>
/* The Smart Advice Responsive Table — Self-Contained */
.tsa-table-wrap {
  margin: 0 0 1.5rem 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 4px rgba(15, 23, 42, .06);
}
.tsa-table-wrap table {
  width: 100%;
  border-collapse: collapse;
  font-size: .9rem;
  min-width: 400px;
  margin-top: 0 !important;
}
.tsa-table-wrap thead {
  background: linear-gradient(90deg, #1a73e8, #6366f1) !important;
}
.tsa-table-wrap thead th {
  color: #fff;
  font-weight: 700;
  padding: .5rem 1rem;
  text-align: left;
  white-space: nowrap;
  font-size: .82rem;
  letter-spacing: .03em;
  text-transform: uppercase;
}
.tsa-table-wrap tbody tr {
  border-bottom: 1px solid #f1f5f9;
  transition: background .12s;
}
.tsa-table-wrap tbody tr:hover {
  background: #f8fafc;
}
.tsa-table-wrap tbody tr:last-child {
  border-bottom: none;
}
.tsa-table-wrap td {
  padding: .65rem 1rem;
  color: #334155;
  line-height: 1.45;
  vertical-align: top;
}
.tsa-table-wrap tbody tr:nth-child(even) {
  background: #f8fafc;
}
.tsa-table-wrap tbody tr:nth-child(even):hover {
  background: #eff6ff;
}
.tsa-table-wrap p {
  display: none !important;
  margin: 0 !important;
  padding: 0 !important;
}
@media (max-width: 640px) {
  .tsa-table-wrap thead th, .tsa-table-wrap td {
    padding: .5rem .65rem;
    font-size: .82rem;
  }
}
</style>`;

// ─── VIDEO EMBED CSS ─────────────────────────────────────────────────────────

export const VIDEO_CSS = `${VIDEO_STYLE_MARKER}
<style>
/* The Smart Advice Video Embed — Self-Contained Lazy Load */
.tsa-video-wrap{margin:2rem 0;border-radius:14px;overflow:hidden;background:#000;position:relative;box-shadow:0 4px 20px rgba(0,0,0,.18)}
.tsa-video-thumb{position:relative;cursor:pointer;aspect-ratio:16/9;overflow:hidden}
.tsa-video-thumb img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
.tsa-video-thumb:hover img{transform:scale(1.03)}
.tsa-play-btn{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.3);transition:background .2s}
.tsa-play-btn:hover{background:rgba(0,0,0,.45)}
.tsa-play-circle{width:68px;height:68px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.3);transition:transform .2s}
.tsa-video-thumb:hover .tsa-play-circle{transform:scale(1.1)}
.tsa-play-circle svg{width:28px;height:28px;margin-left:4px}
.tsa-video-title{position:absolute;bottom:0;left:0;right:0;padding:.6rem 1rem;background:linear-gradient(0deg,rgba(0,0,0,.7),transparent);color:#fff;font-size:.85rem;font-weight:600;pointer-events:none}
.tsa-video-iframe-wrap{position:relative;aspect-ratio:16/9;display:none}
.tsa-video-iframe-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:none}
.tsa-video-wrap.tsa-active .tsa-video-thumb{display:none}
.tsa-video-wrap.tsa-active .tsa-video-iframe-wrap{display:block}
</style>
<script>
(function(){
  function initVideos(){
    document.querySelectorAll('.tsa-video-wrap:not([data-vd-init])').forEach(function(w){
      w.setAttribute('data-vd-init','1');
      const thumb=w.querySelector('.tsa-video-thumb');
      if(!thumb) return;
      thumb.addEventListener('click',function(){
        const src=w.dataset.src;
        if(!src) return;
        const iw=w.querySelector('.tsa-video-iframe-wrap');
        if(!iw) return;
        const iframe=document.createElement('iframe');
        iframe.src=src;
        iframe.allow='accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share';
        iframe.allowFullscreen=true;
        iframe.loading='lazy';
        iw.innerHTML='';
        iw.appendChild(iframe);
        w.classList.add('tsa-active');
      });
    });
  }
  document.addEventListener('DOMContentLoaded',initVideos);
  initVideos();
})();
</script>`;

// ─── Detection helpers ────────────────────────────────────────────────────────

export function hasMCQ(content: string): boolean {
  return (
    /##\s+Test Your Knowledge/i.test(content) ||
    /##\s+MCQ|##\s+Quiz|##\s+Multiple.?Choice/i.test(content) ||
    /tsa-quiz-wrap/i.test(content)
  );
}

export function hasTable(content: string): boolean {
  return /\|.+\|.+\|/.test(content) || /<table[\s>]/i.test(content);
}

export function hasVideo(content: string): boolean {
  return /tsa-video-wrap/i.test(content) || /data-src="https?:\/\//i.test(content);
}──────

export function hasMCQ(content: string): boolean {
  return (
    /##\s+Test Your Knowledge/i.test(content) ||
    /##\s+MCQ|##\s+Quiz|##\s+Multiple.?Choice/i.test(content) ||
    /tsa-quiz-wrap/i.test(content)
  );
}

export function hasTable(content: string): boolean {
  return /\|.+\|.+\|/.test(content) || /<table[\s>]/i.test(content);
}

export function hasVideo(content: string): boolean {
  return /tsa-video-wrap/i.test(content) || /data-src="https?:\/\//i.test(content);
}

// ─── MCQ Markdown → Interactive HTML converter ───────────────────────────────

export function convertMCQMarkdownToHTML(markdown: string): string {
  const sectionMatch = markdown.match(
    /([\s\S]*?)(##\s+(?:Test Your Knowledge.*?|MCQs?|Quiz.*?|Multiple.?Choice.*?)\n)([\s\S]*)/i
  );
  if (!sectionMatch) return markdown;

  const beforeSection = sectionMatch[1];
  const sectionHeading = sectionMatch[2].trim();
  const quizBody = sectionMatch[3];

  const questionBlocks = quizBody.split(/\n(?=###\s+Q?\d+\.?|(?:\*\*)?\d+[\.\)]\s)/);
  const questionHTMLs: string[] = [];

  questionBlocks.forEach((block, qIdx) => {
    if (!block.trim()) return;

    const lines = block.trim().split('\n');
    let questionText = lines[0]
      .replace(/^###\s+/, '')
      .replace(/^\*\*\d+[\.\)]\*\*\s*/, '')
      .replace(/^\d+[\.\)]\s*/, '')
      .replace(/\*\*/g, '')
      .trim();

    if (!questionText) return;

    const options: { letter: string; text: string; isCorrect: boolean }[] = [];
    let explanation = '';

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (/^Explanation[:\s]/i.test(line)) {
        explanation = line.replace(/^Explanation[:\s]*/i, '').trim();
        while (i + 1 < lines.length && !lines[i + 1].trim().match(/^[A-D][\)\.]|\*\*[A-D]/)) {
          i++;
          if (lines[i].trim()) explanation += ' ' + lines[i].trim();
          else break;
        }
        continue;
      }

      const optMatch = line.match(/^-?\s*\*?\*?([A-Da-d])[\.\)]\*?\*?\s*(.*)/);
      if (optMatch) {
        const letter = optMatch[1].toUpperCase();
        const isCorrect = /\*\*[A-Da-d][\.\)]/.test(line) || /\*\*.*\*\*/.test(line);
        const text = optMatch[2].replace(/\*\*/g, '').trim();
        if (text) options.push({ letter, text, isCorrect });
      }
    }

    if (options.length < 2) return;

    const qId = `tsa-q-${qIdx + 1}`;

    const optsHTML = options
      .map(
        (opt) => `<div class="tsa-option" data-correct="${opt.isCorrect}" data-question="${qId}" role="button" tabindex="0">
        ${opt.text}
      </div>`
      )
      .join('\n');

    const expHTML = explanation
      ? `<div class="tsa-exp" data-question="${qId}"><b>EXPLANATION:</b> ${explanation}</div>`
      : '';

    questionHTMLs.push(`
<div class="tsa-question" id="${qId}">
    <b>${qIdx + 1}.</b> ${questionText}
</div>
${optsHTML}
${expHTML}
<hr class="tsa-divider" />`);
  });

  if (questionHTMLs.length === 0) return markdown;

  const quizHTML = `\n\n<div class="tsa-quiz-wrap">
<h2 class="tsa-quiz-header">${sectionHeading.replace(/^#+\s*/, '').trim()}</h2>

<div class="tsa-progress-container">
    <div class="tsa-percentage">0%</div>
    <div class="tsa-progress-bar" id="tsa-progressBar"></div>
</div>
<hr class="tsa-divider" />

${questionHTMLs.join('\n')}

<button class="tsa-reset-btn" id="tsa-resetButton">
<svg class="tsa-reset-svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.13 17.13c-.15.18-.31.36-.48.52-.73.74-1.59 1.31-2.54 1.71-1.97.83-4.26.83-6.23 0-.95-.4-1.81-.98-2.54-1.72a7.8 7.8 0 0 1-1.71-2.54c-.42-.99-.63-2.03-.63-3.11H2c0 1.35.26 2.66.79 3.89.5 1.19 1.23 2.26 2.14 3.18s1.99 1.64 3.18 2.14c1.23.52 2.54.79 3.89.79s2.66-.26 3.89-.79c1.19-.5 2.26-1.23 3.18-2.14.17-.17.32-.35.48-.52L22 20.99v-6h-6l2.13 2.13Zm.94-12.2a9.9 9.9 0 0 0-3.18-2.14 10.12 10.12 0 0 0-7.79 0c-1.19.5-2.26 1.23-3.18 2.14-.17.17-.32.35-.48.52L1.99 3v6h6L5.86 6.87c.15-.18.31-.36.48-.52.73-.74 1.59-1.31 2.54-1.71 1.97-.83 4.26-.83 6.23 0 .95.4 1.81.98 2.54 1.72.74.73 1.31 1.59 1.71 2.54.42.99.63 2.03.63 3.11h2c0-1.35-.26-2.66-.79-3.89-.5-1.19-1.23-2.26-2.14-3.18Z"></path></svg>
<span>RESET QUIZ</span>
</button>

<div class="tsa-report-card">
    <h3>Report Card</h3>
    <div class="tsa-stats-grid">
        <div class="tsa-stat-item">
            <span class="tsa-stat-icon"><svg width="36" height="36" fill="#1a73e8" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M11 15h2v2h-2zM9.53 8.03c-.66.66-1.03 1.54-1.03 2.47h2c0-.4.16-.78.44-1.06.57-.57 1.55-.57 2.12 0A1.499 1.499 0 0 1 12 12c-.55 0-1 .45-1 1v1h2v-.14c.55-.16 1.06-.46 1.47-.88.66-.66 1.03-1.54 1.03-2.47s-.36-1.81-1.03-2.47c-1.32-1.32-3.63-1.32-4.95 0Z"></path><path d="M12 2C6.49 2 2 6.49 2 12c0 2.12.68 4.19 1.93 5.9l-1.75 2.53c-.21.31-.24.7-.06 1.03.17.33.51.54.89.54h9c5.51 0 10-4.49 10-10S17.51 2 12 2m0 18H4.91L6 18.43c.26-.37.23-.88-.06-1.22A7.98 7.98 0 0 1 4.01 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8Z"></path></svg></span>
            <span class="tsa-stat-value" id="tsa-attemptedCount">0</span>
            <span class="tsa-stat-label">Attempted</span>
        </div>
        <div class="tsa-stat-item">
            <span class="tsa-stat-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" fill="#dcfce7" stroke="#4ade80" stroke-width="1.2"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <span class="tsa-stat-value tsa-val-correct" id="tsa-correctCount">0</span>
            <span class="tsa-stat-label">Correct</span>
        </div>
        <div class="tsa-stat-item">
            <span class="tsa-stat-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" fill="#fee2e2" stroke="#f87171" stroke-width="1.2"/><path d="M9 9l6 6M15 9l-6 6" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round"/></svg></span>
            <span class="tsa-stat-value tsa-val-wrong" id="tsa-wrongCount">0</span>
            <span class="tsa-stat-label">Wrong</span>
        </div>
    </div>
    <span id="tsa-message">PRACTICE REGULARLY!</span>
</div>
</div>\n\n`;

  return beforeSection + quizHTML;
}

// ─── Table Markdown → styled HTML ────────────────────────────────────────────

export function wrapMarkdownTables(content: string): string {
  return content.replace(
    /((?:^|\n)(\|[^\n]+\|\n)((?:\|[-: ]+\|[-: |]*\n))((?:\|[^\n]+\|\n?)+))/gm,
    (match) => {
      return `\n\n<div class="tsa-table-wrap">\n\n${match.trim()}\n\n</div>\n\n`;
    }
  );
}

// ─── Video HTML builder ───────────────────────────────────────────────────────

export function buildVideoHTML(opts: {
  url: string;
  title?: string;
  thumbUrl?: string;
  source: 'youtube' | 'gdrive' | 'r2' | 'direct';
}): string {
  const { url, title = 'Watch Video', source } = opts;

  let embedSrc = '';
  let thumbUrl = opts.thumbUrl || '';

  if (source === 'youtube') {
    const idMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    );
    const videoId = idMatch ? idMatch[1] : url.trim();
    embedSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    thumbUrl = thumbUrl || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  } else if (source === 'gdrive') {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = idMatch ? idMatch[1] : url;
    embedSrc = `https://drive.google.com/file/d/${fileId}/preview`;
    thumbUrl = thumbUrl || '';
  } else if (source === 'r2') {
    embedSrc = url;
    thumbUrl = thumbUrl || '';
  } else {
    embedSrc = url;
  }

  const thumbHTML = thumbUrl
    ? `<img src="${thumbUrl}" alt="${title}" loading="lazy" decoding="async">`
    : `<div style="aspect-ratio:16/9;background:#1e293b;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:.9rem">Click to play video</div>`;

  return `<div class="tsa-video-wrap" data-src="${embedSrc}">
  <div class="tsa-video-thumb" role="button" tabindex="0" aria-label="Play: ${title}">
    ${thumbHTML}
    <div class="tsa-play-btn">
      <div class="tsa-play-circle">
        <svg viewBox="0 0 24 24" fill="#1a73e8"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </div>
    <div class="tsa-video-title">${title}</div>
  </div>
  <div class="tsa-video-iframe-wrap"></div>
</div>`;
}

// ─── Master injector: call this after AI generation ─────────────────────────

export function injectRichComponentStyles(
  content: string,
  convertMCQ = true
): string {
  let enriched = content;

  // Convert MCQ markdown to interactive HTML first
  if (convertMCQ && hasMCQ(enriched)) {
    enriched = convertMCQMarkdownToHTML(enriched);
  }

  // Wrap markdown tables
  if (hasTable(enriched)) {
    enriched = wrapMarkdownTables(enriched);
  }

  // Build the styles suffix (only what's needed, added at the end)
  let styleSuffix = '';

  if (hasMCQ(enriched) && !enriched.includes(MCQ_STYLE_MARKER)) {
    styleSuffix += '\n\n' + MCQ_CSS;
  }
  if (hasTable(enriched) && !enriched.includes(TABLE_STYLE_MARKER)) {
    styleSuffix += '\n\n' + TABLE_CSS;
  }
  if (hasVideo(enriched) && !enriched.includes(VIDEO_STYLE_MARKER)) {
    styleSuffix += '\n\n' + VIDEO_CSS;
  }

  return enriched + styleSuffix;
}

export function ensureVideoStyles(existingContent: string): string {
  if (existingContent.includes(VIDEO_STYLE_MARKER)) return existingContent;
  return existingContent + '\n\n' + VIDEO_CSS;
}

export function ensureTableStyles(existingContent: string): string {
  if (existingContent.includes(TABLE_STYLE_MARKER)) return existingContent;
  return existingContent + '\n\n' + TABLE_CSS;
}