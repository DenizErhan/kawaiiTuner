/* The band's polls (#/band/polls) and the new-poll dialog. Anyone asks and
   votes; whoever asked closes a poll by tapping the winner. Votes count only
   for people still in the band. */
import { PLAN_LIMITS, cleanPoll, tally, toggleVote, leader } from '../../core/plan.js';
import { t } from '../../i18n/i18n.js';
import { html, render } from '../../ui/html.js';
import { $, el, iconBtn, empty, closeOnBackdrop } from '../../ui/dom.js';

const template = () => html`
  <div class="band-screen" id="panePolls" hidden>
    <button class="add-btn" id="btnAddPoll">${t('band.polls.add')}</button>
    <ul class="list" id="pollList"></ul>
  </div>`;

const dialog = () => html`
  <dialog class="pop" id="pollDialog" aria-labelledby="pollDialogTitle">
    <form method="dialog" id="pollForm" novalidate>
      <h2 id="pollDialogTitle">${t('band.polls.dialogTitle')}</h2>
      <label class="field"><span>${t('band.polls.question')}</span><input name="question" maxlength="${PLAN_LIMITS.question}" autocomplete="off" placeholder="${t('band.polls.questionHint')}"></label>
      <div class="field"><span>${t('band.polls.options')}</span><ul class="opt-inputs" id="optInputs"></ul></div>
      <button type="button" class="link-btn" id="btnAddOption">${t('band.polls.addOption')}</button>
      <label class="check"><input type="checkbox" name="multi" checked> ${t('band.polls.multi')}</label>
      <p class="pop-hint err" id="pollErr"></p>
      <div class="pop-actions">
        <button type="button" class="ghost" id="btnCancelPoll">${t('common.cancel')}</button>
        <button class="go go-sm" value="save">${t('band.polls.ask')}</button>
      </div>
    </form>
  </dialog>`;

const myPicks = (p, uid) => (p.votes && Array.isArray(p.votes[uid]) ? p.votes[uid] : []);
const created = (p) => (p.createdAt && p.createdAt.toMillis ? p.createdAt.toMillis() : typeof p.createdAt === 'number' ? p.createdAt : Infinity); // Infinity: not on the server yet

/** How many open polls you haven't voted in. */
export const needsVote = (polls, uid) => polls.filter((p) => !p.closed && !myPicks(p, uid).length).length;

export function createPolls(parent, ctx) {
  const screen = render(template());
  parent.appendChild(screen);
  document.body.appendChild(render(dialog()));
  closeOnBackdrop($('pollDialog'));
  const { state } = ctx;
  let closing = null; // the poll whose winner is being picked

  function renderPolls() {
    if (closing && !state.polls.some((p) => p.id === closing && !p.closed)) closing = null;
    const ul = $('pollList');
    ul.textContent = '';
    // open polls first, newest on top
    const list = state.polls.slice().sort((a, b) => (a.closed - b.closed) || (created(b) > created(a)) - (created(b) < created(a)));
    if (!list.length) return empty(ul, t('band.polls.empty'));
    list.forEach((p) => ul.appendChild(card(p)));
  }

  function card(p) {
    const me = ctx.me();
    const tl = tally(p, ctx.memberIds());
    const voters = new Set(tl.flatMap((x) => x.uids)).size;
    const mine = myPicks(p, me);
    const isClosing = closing === p.id;
    const li = el('li', 'poll' + (p.closed ? ' closed' : ''));
    li.dataset.poll = p.id;
    li.appendChild(el('strong', 'poll-q', p.question));
    const how = t(p.closed ? 'band.polls.decided' : p.multi ? 'band.polls.pickAny' : 'band.polls.pickOne');
    li.appendChild(el('small', 'poll-meta', [t('band.polls.asked', { name: ctx.nameOf(p.createdBy) }), how, t('band.polls.voted', { n: voters })].join(' · ')));
    if (isClosing) li.appendChild(el('p', 'poll-hint', t('band.polls.closeHint', { option: p.options[leader(tl)] })));

    const opts = el('div', 'poll-opts');
    const n = Math.max(1, state.members.length);
    p.options.forEach((o, i) => {
      const won = p.closed && p.winner === i;
      const b = el('button', 'opt' + (won ? ' win' : ''));
      b.dataset.opt = i;
      b.disabled = p.closed;
      b.setAttribute('aria-pressed', String(mine.includes(i)));
      b.style.setProperty('--p', Math.round(100 * tl[i].count / n) + '%');
      const line = el('span', 'opt-line');
      line.append(el('span', 'opt-label', (won ? '✓ ' : '') + o), el('span', 'opt-n', String(tl[i].count)));
      b.append(line, el('small', 'opt-who', tl[i].uids.map(ctx.nameOf).sort().join(', ')));
      opts.appendChild(b);
    });
    li.appendChild(opts);

    if (p.createdBy === me) {
      const foot = el('div', 'poll-foot');
      const link = (key, act) => { const b = el('button', 'link-btn', t(key)); b.dataset.act = act; foot.appendChild(b); };
      if (!p.closed) link(isClosing ? 'common.cancel' : 'band.polls.close', isClosing ? 'keep' : 'close');
      else link('band.polls.delete', 'delete');
      li.appendChild(foot);
    }
    return li;
  }

  function tap(e) {
    const b = e.target.closest('button');
    const li = e.target.closest('li[data-poll]');
    const p = li && state.polls.find((x) => x.id === li.dataset.poll);
    if (!b || !p) return;
    const { api, code } = state;
    if (b.dataset.act === 'close') closing = p.id;
    else if (b.dataset.act === 'keep') closing = null;
    else if (b.dataset.act === 'delete') {
      if (!confirm(t('band.polls.deleteConfirm', { question: p.question }))) return;
      ctx.write(api.deletePoll(code, p.id));
    } else if (b.dataset.opt != null && !p.closed) {
      const i = Number(b.dataset.opt);
      if (closing === p.id) { closing = null; ctx.write(api.closePoll(code, p.id, i)); }
      else ctx.write(api.vote(code, p.id, toggleVote(myPicks(p, ctx.me()), i, p.multi)));
    }
    renderPolls();
  }

  // ---------- dialog ----------

  /** Opens the new-poll dialog, filled in (the calendar uses this for day polls). */
  function openPoll(question, options, multi) {
    const f = $('pollForm');
    f.elements.question.value = question;
    f.elements.multi.checked = multi;
    $('optInputs').textContent = '';
    (options.length >= 2 ? options : options.concat('', '').slice(0, 2)).forEach(addOption);
    $('pollErr').textContent = '';
    $('pollDialog').showModal();
    if (!question) f.elements.question.focus();
  }

  function addOption(value) {
    const ul = $('optInputs');
    if (ul.children.length >= PLAN_LIMITS.options) return null;
    const input = el('input');
    input.maxLength = PLAN_LIMITS.option;
    input.autocomplete = 'off';
    input.value = value || '';
    input.placeholder = t('band.polls.option', { n: ul.children.length + 1 });
    input.setAttribute('aria-label', input.placeholder);
    const li = el('li', 'opt-input');
    li.append(input, iconBtn('remove', t('band.polls.removeOption'), { rm: '' }));
    ul.appendChild(li);
    syncOptions();
    return input;
  }
  function syncOptions() {
    const items = [...$('optInputs').children];
    items.forEach((li) => { li.querySelector('[data-rm]').hidden = items.length <= 2; });
    $('btnAddOption').hidden = items.length >= PLAN_LIMITS.options;
  }

  function save(e) {
    e.preventDefault();
    const f = $('pollForm');
    const poll = cleanPoll({
      question: f.elements.question.value,
      options: [...$('optInputs').querySelectorAll('input')].map((i) => i.value),
      multi: f.elements.multi.checked,
    });
    if (!poll) { $('pollErr').textContent = t('band.polls.invalid'); return; }
    ctx.write(state.api.newPoll(state.code, poll));
    $('pollDialog').close();
  }

  $('btnAddPoll').addEventListener('click', () => openPoll('', [], true));
  $('pollList').addEventListener('click', tap);
  $('btnAddOption').addEventListener('click', () => { const i = addOption(''); if (i) i.focus(); });
  $('optInputs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-rm]');
    if (b) { b.parentElement.remove(); syncOptions(); }
  });
  $('pollForm').addEventListener('submit', save);
  $('btnCancelPoll').addEventListener('click', () => $('pollDialog').close());

  return { el: screen, render: renderPolls, openPoll };
}
