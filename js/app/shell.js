/* The frame around every screen: the top bar (☰ or a back arrow, the title,
   the screen's own buttons) and the ☰ menu, a modal <dialog> sliding in from
   the left, so the phone's back button and Esc close it.
   Screens plug in as { id, el, head(route), show(route), hide() };
   head() returns { title, up?: address for the back arrow, actions?: [buttons],
   modes?: true to show the Tuner | Metronome switch in place of the title }. */
import { t } from '../i18n/i18n.js';
import { html, render } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { $, closeOnBackdrop } from '../ui/dom.js';
import { path, up } from './router.js';

const header = () => html`
  <header class="top">
    <button class="icon-btn menu-btn" id="btnMenu" aria-label="${t('nav.menu')}" aria-haspopup="dialog" aria-controls="drawer">
      ${icon('menu')}<i class="dot" id="menuDot" hidden></i>
    </button>
    <button class="icon-btn" id="btnUp" aria-label="${t('nav.back')}" hidden>${icon('back')}</button>
    <h1 class="top-title" id="topTitle"></h1>
    <nav class="mode-switch" id="modeSwitch" aria-label="${t('nav.modes')}" hidden>
      <a href="${path('tuner')}" data-route="tuner">${t('nav.tuner')}</a>
      <a href="${path('metronome')}" data-route="metronome">${t('nav.metronome')}</a>
    </nav>
    <div class="top-actions" id="topActions"></div>
  </header>`;

const item = (parts, ico, label, extra) => html`
  <a class="nav-item" href="${path(...parts)}" data-route="${parts.join('/')}">${icon(ico)}<span>${label}</span>${extra}</a>`;

const drawer = () => html`
  <dialog class="drawer" id="drawer" aria-label="${t('nav.menu')}">
    <div class="drawer-head">
      <img src="icons/icon.svg" width="40" height="40" alt="">
      <strong>${t('app.name')}</strong>
      <button class="icon-btn" id="btnCloseMenu" aria-label="${t('nav.closeMenu')}">${icon('close', 18)}</button>
    </div>
    <nav class="drawer-nav">
      ${item(['tuner'], 'tuner', t('nav.tuner'))}
      ${item(['metronome'], 'metronome', t('nav.metronome'))}
      <p class="nav-label" id="navBandName"></p>
      <a class="nav-item" href="${path('band')}" data-route="band">${icon('band')}<span id="navBandHome"></span></a>
      <div id="navBandItems">
        ${item(['band', 'polls'], 'polls', t('nav.polls'), html`<b class="count" id="navPollCount" hidden></b>`)}
        ${item(['band', 'calendar'], 'calendar', t('nav.calendar'))}
        ${item(['band', 'songs'], 'songs', t('nav.songs'))}
        ${item(['band', 'setlists'], 'setlists', t('nav.setlists'))}
      </div>
      <hr>
      <button class="nav-item" id="navSettings">${icon('settings')}<span>${t('nav.settings')}</span></button>
    </nav>
  </dialog>`;

/** app: the page's .app element; openSettings(): shows the settings sheet. */
export function createShell(app, { openSettings }) {
  app.appendChild(render(header()));
  const views = render(html`<main class="views" id="views"></main>`);
  app.appendChild(views);
  const menu = render(drawer());
  document.body.appendChild(menu);
  closeOnBackdrop(menu);

  let current = null, route = null, upTo = null;

  $('btnMenu').addEventListener('click', () => menu.showModal());
  $('btnCloseMenu').addEventListener('click', () => menu.close());
  $('btnUp').addEventListener('click', () => up(upTo));
  menu.addEventListener('click', (e) => { if (e.target.closest('a.nav-item')) menu.close(); });
  $('navSettings').addEventListener('click', () => { menu.close(); openSettings(); });

  function drawHead() {
    const h = current.head(route);
    $('topTitle').textContent = h.title || '';
    $('topTitle').classList.toggle('sr-only', !!h.modes); // the switch shows it instead
    $('modeSwitch').hidden = !h.modes;
    $('modeSwitch').querySelectorAll('a').forEach((a) => {
      if (a.dataset.route === route.view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    upTo = h.up || null;
    $('btnMenu').hidden = !!upTo;
    $('btnUp').hidden = !upTo;
    $('topActions').replaceChildren(...(h.actions || []));
    // the menu marks where you are (one setlist counts as Setlists)
    const here = [route.view, route.sub].filter(Boolean).join('/');
    menu.querySelectorAll('a.nav-item').forEach((a) => {
      if (a.dataset.route === here) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  return {
    views,
    /** Shows a screen for a route; the previous one is hidden (and stopped). */
    show(view, r) {
      const moved = view !== current || !route || r.sub !== route.sub || r.id !== route.id;
      if (current && current !== view) { current.hide(); current.el.hidden = true; }
      current = view; route = r;
      view.el.hidden = false;
      app.dataset.mode = view.id;
      view.show(r);
      drawHead();
      if (moved) window.scrollTo(0, 0);
    },
    /** Redraws the top bar, e.g. once the band's name has loaded. */
    refresh() { if (current) drawHead(); },
    /** Band part of the menu, and the dot on ☰ for polls waiting for your vote. */
    setBand({ inBand, name, needVote }) {
      $('navBandName').textContent = inBand && name ? name : t('nav.band');
      $('navBandHome').textContent = t(inBand ? 'nav.bandHome' : 'nav.joinBand');
      $('navBandItems').hidden = !inBand;
      $('navPollCount').hidden = !needVote;
      $('navPollCount').textContent = needVote || '';
      $('menuDot').hidden = !needVote;
      $('btnMenu').setAttribute('aria-label', needVote ? t('nav.menu') + ' · ' + t('nav.needsVote', { n: needVote }) : t('nav.menu'));
    },
  };
}
