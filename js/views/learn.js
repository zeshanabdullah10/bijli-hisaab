// Learn tab: money-saving tips, a searchable glossary of every bill line, and
// a step-by-step guide for disputing a bill.

import { app } from '../app.js';
import { $, $$, esc, icon } from '../ui.js';

let root = null;

export const learnView = {
  id: 'learn',

  build() {
    const { t, state, learn } = app;
    const ur = state.lang === 'ur';
    root = document.getElementById('view-learn');
    const pick = (o, k) => o[`${k}_${ur ? 'ur' : 'en'}`];
    root.innerHTML = `
      <div class="page-head"><h1>${esc(t('learn_title'))}</h1><p>${esc(t('learn_sub'))}</p></div>

      <section class="stack" aria-label="${esc(t('learn_tips'))}">
        ${learn.tips.map((x) => `
          <div class="insight lvl-tip">
            <span class="insight-ic">${icon(x.icon)}</span>
            <div class="insight-body"><b class="${ur ? 'ur' : ''}">${esc(pick(x, 'head'))}</b><p>${esc(pick(x, 'body'))}</p></div>
          </div>`).join('')}
      </section>

      <section class="card" id="glossary">
        <header class="card-head">${icon('book-2', 'head-ic')}<h2>${esc(t('learn_glossary'))}</h2></header>
        <div class="search">${icon('search')}<input type="search" id="gl-search" placeholder="${esc(t('learn_search'))}" aria-label="${esc(t('learn_search'))}"></div>
        <div id="gl-list">
          ${learn.glossary.map((g) => `
            <details class="term" id="term-${g.id}" data-text="${esc((g.term_en + ' ' + g.body_en + ' ' + g.term_ur + ' ' + g.body_ur).toLowerCase())}">
              <summary><span class="${ur ? 'ur' : ''}">${esc(pick(g, 'term'))}</span>${icon('chevron-down', 'line-chev')}</summary>
              <p class="${ur ? 'ur' : ''}">${esc(pick(g, 'body'))}</p>
            </details>`).join('')}
        </div>
        <p class="note" id="gl-none" hidden>${esc(t('learn_none'))}</p>
      </section>

      <section class="card">
        <header class="card-head">${icon('flag', 'head-ic')}<h2>${esc(t('learn_dispute'))}</h2></header>
        <ol class="steps">
          ${learn.dispute.map((s) => `<li class="${ur ? 'ur' : ''}">${esc(ur ? s.ur : s.en)}</li>`).join('')}
        </ol>
        <p class="audit-links">
          <a href="tel:${esc(app.disco.helpline)}">${icon('phone')} ${esc(app.disco.name_en)} ${esc(t('audit_helpline'))}: ${esc(app.disco.helpline)}</a><br>
          <a href="${esc(app.disco.regulator_complaints || 'https://nepra.org.pk/complaints.php')}" target="_blank" rel="noopener">${icon('external-link')} ${esc(t('audit_file'))}</a>
        </p>
        <p class="note">${esc(t('learn_dispute_note'))}</p>
      </section>`;

    $('#gl-search', root).addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      let shown = 0;
      $$('.term', root).forEach((d) => {
        const hit = !q || d.dataset.text.includes(q);
        d.hidden = !hit;
        if (hit) shown++;
        if (q && hit) d.open = true;
      });
      $('#gl-none', root).hidden = shown > 0;
    });
    this.update();
  },

  /** Open and scroll to a glossary entry, e.g. from "What's this?" on a bill line. */
  focusTerm(id) {
    const d = root && document.getElementById(`term-${id}`);
    if (!d) return;
    d.open = true;
    requestAnimationFrame(() => d.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  },

  update() {},
};
