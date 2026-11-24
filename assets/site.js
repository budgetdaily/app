// BudgetDaily site script. Loaded with defer, so it never
// blocks rendering and also runs when a page is opened straight from disk.
// Every page works without it; each block below only adds.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ── Navigation ──────────────────────────────────────────────────────────
// The menu is a popover on narrow screens and an inline list on wide ones.
// If the window is widened while it is open, close it so it leaves the top layer.
const menu = document.getElementById('site-menu');
if (menu && 'popover' in HTMLElement.prototype) {
  matchMedia('(width >= 44rem)').addEventListener('change', (event) => {
    if (event.matches && menu.matches(':popover-open')) menu.hidePopover();
  });
}

// The header slides away while scrolling down and comes back on any scroll
// up. It stays put near the top, while its menu is open, or while it has focus.
const header = document.querySelector('.site-header');
if (header) {
  const NEAR_TOP = 80;
  const SLACK = 8;
  let lastY = scrollY;
  let ticking = false;

  const update = () => {
    ticking = false;
    const y = Math.max(scrollY, 0);
    const delta = y - lastY;
    if (Math.abs(delta) < SLACK) return;
    const held = y < NEAR_TOP
      || header.contains(document.activeElement)
      || menu?.matches(':popover-open');
    header.classList.toggle('is-tucked', !held && delta > 0);
    lastY = y;
  };

  addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  header.addEventListener('focusin', () => header.classList.remove('is-tucked'));
}

// ── Figures that roll ───────────────────────────────────────────────────
// roll(element, text) shows text in the element, turning each digit like a
// counter wheel. The plain text stays in the element for screen readers.
const DIGITS = '0123456789';

const roll = (element, text) => {
  if (!element.rollView) {
    element.rollSpoken = document.createElement('span');
    element.rollSpoken.className = 'visually-hidden';
    element.rollView = document.createElement('span');
    element.rollView.className = 'roll-view';
    element.rollView.setAttribute('aria-hidden', 'true');
    element.rollWheels = [];
    element.replaceChildren(element.rollSpoken, element.rollView);
  }
  element.rollSpoken.textContent = text;

  // Wheels are counted from the right, so $9.50 → $12.50 keeps its cents still.
  const characters = [...text];
  const shape = characters.map((character) => (DIGITS.includes(character) ? '0' : character)).join('');
  let place = characters.filter((character) => DIGITS.includes(character)).length;

  if (shape !== element.rollShape) {
    const before = element.rollWheels.map((wheel) => wheel.style.getPropertyValue('--d'));
    element.rollWheels = [];
    element.rollView.replaceChildren(...characters.map((character) => {
      const cell = document.createElement('span');
      if (!DIGITS.includes(character)) {
        cell.className = 'roll-c';
        cell.textContent = character;
        return cell;
      }
      place -= 1;
      cell.className = 'roll-d';
      const wheel = document.createElement('span');
      for (const digit of DIGITS) wheel.append(Object.assign(document.createElement('i'), { textContent: digit }));
      wheel.style.setProperty('--d', before[place] ?? '0');
      element.rollWheels[place] = wheel;
      cell.append(wheel);
      return cell;
    }));
    element.rollShape = shape;
    // Commit the starting positions, so the wheels turn from them.
    void element.rollView.offsetWidth;
    place = element.rollWheels.length;
  }

  for (const character of characters) {
    if (!DIGITS.includes(character)) continue;
    place -= 1;
    element.rollWheels[place].style.setProperty('--d', character);
  }
};

// ── Home: the phone in the hero ─────────────────────────────────────────
// A working sketch of the Budgets tab, seeded with the same sample data as
// the screenshots further down. Amounts are whole cents throughout.
const app = document.querySelector('[data-app]');
const tryIt = document.querySelector('[data-try]');
if (app && tryIt) {
  const SEED = [
    { id: 'groceries', name: 'Groceries', allowance: 3000, balance: 1820 },
    { id: 'dining', name: 'Food & Dining', allowance: 1714, balance: 8836 },
    { id: 'transport', name: 'Transport', allowance: 1000, balance: 2380 },
    { id: 'fun', name: 'Entertainment', allowance: 1000, balance: 4000 },
  ];
  const SPENT_SEED = 2925;
  const allowance = SEED.reduce((sum, budget) => sum + budget.allowance, 0);

  let budgets;
  let spent;
  let day;
  const start = () => {
    budgets = SEED.map((budget) => ({ ...budget }));
    spent = SPENT_SEED;
    day = 0;
  };
  start();

  const money = (cents) => `$${(Math.abs(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const signed = (cents) => (cents < 0 ? '−' : '') + money(cents);
  const gained = (cents) => `+${money(cents)}`;
  const weekday = (offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toLocaleDateString('en', { weekday: 'long' });
  };

  const total = app.querySelector('[data-total]');
  const spentOutput = app.querySelector('[data-spent]');
  const summary = app.querySelector('[data-summary]');
  const toast = app.querySelector('[data-toast]');
  const status = tryIt.querySelector('[data-try-status]');
  const rows = new Map(SEED.map((budget) => [budget.id, app.querySelector(`[data-budget="${budget.id}"]`)]));

  const render = (from) => {
    const shown = from ?? budgets;
    const sum = shown.reduce((all, budget) => all + budget.balance, 0);
    roll(total, signed(sum));
    total.classList.toggle('is-down', sum < 0);
    roll(spentOutput, money(spent));
    for (const budget of shown) {
      const row = rows.get(budget.id);
      const balance = row.querySelector('[data-balance]');
      roll(balance, signed(budget.balance));
      balance.classList.toggle('is-down', budget.balance < 0);
      roll(row.querySelector('[data-tomorrow]'), signed(budget.balance + budget.allowance));
    }
    app.setAttribute('aria-label', `The Budgets tab in BudgetDaily: Today's balance of ${signed(sum)} across four budgets, a daily allowance of ${gained(allowance)} and ${money(spent)} spent today.`);
  };

  // Replays an animation class on an element that may already carry it.
  const hit = (element) => {
    element.classList.remove('is-hit');
    void element.offsetWidth;
    element.classList.add('is-hit');
  };

  let toastTimer;
  const announce = (label, amount, tone) => {
    const [what, howMuch] = toast.children;
    what.textContent = label;
    howMuch.textContent = amount;
    howMuch.className = tone;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 1900);
  };

  const say = (sentence) => {
    const again = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Start over' });
    again.dataset.reset = '';
    status.replaceChildren(`${sentence} `, again);
  };

  tryIt.addEventListener('click', (event) => {
    const chip = event.target.closest('button');
    if (!chip) return;

    if ('spend' in chip.dataset) {
      const budget = budgets.find((candidate) => candidate.id === chip.dataset.spend);
      const cents = Number(chip.dataset.cents);
      budget.balance -= cents;
      spent += cents;
      render();
      hit(rows.get(budget.id));
      announce(chip.dataset.label, `−${money(cents)}`, 'is-down');
      if (budget.balance >= 0) {
        say(`${chip.dataset.label} logged. ${budget.name} has ${money(budget.balance)} left for today, and ${money(budget.balance + budget.allowance)} tomorrow if you stop there.`);
      } else {
        const days = Math.ceil(-budget.balance / budget.allowance);
        say(`${chip.dataset.label} logged. ${budget.name} is ${money(budget.balance)} behind pace: ${days} ${days === 1 ? 'day' : 'days'} without spending brings it back.`);
      }
    } else if ('next' in chip.dataset) {
      for (const budget of budgets) budget.balance += budget.allowance;
      spent = 0;
      day += 1;
      render();
      hit(summary);
      announce(weekday(day), gained(allowance), 'is-up');
      say(`It is ${weekday(day)}. ${money(allowance)} of allowance landed across four budgets, on top of whatever you did not spend.`);
    } else if ('reset' in chip.dataset) {
      start();
      render();
      status.textContent = 'Back to the start. A working sketch of the Budgets tab, with sample data.';
    }
  });

  // The status bar shows the visitor's own time, as a phone would.
  const clock = app.querySelector('[data-clock]');
  const tick = () => {
    const now = new Date();
    clock.textContent = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
  };
  tick();
  setInterval(tick, 20000);

  tryIt.hidden = false;

  // The opening: the phone arrives showing yesterday's close, then today's
  // allowance lands and every figure rolls up to where the day starts.
  if (reducedMotion.matches) {
    render();
  } else {
    render(budgets.map((budget) => ({ ...budget, balance: budget.balance - budget.allowance })));
    setTimeout(() => {
      render();
      hit(summary);
      announce(weekday(0), gained(allowance), 'is-up');
    }, 1100);
  }

  // On a wide screen with a mouse, the phone turns a little to follow it.
  const phone = document.querySelector('[data-tilt]');
  const hero = phone?.closest('.hero');
  if (hero && matchMedia('(hover: hover) and (pointer: fine)').matches && !reducedMotion.matches) {
    hero.addEventListener('pointermove', (event) => {
      const box = hero.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      phone.style.setProperty('--ry', `${-14 + x * 12}deg`);
      phone.style.setProperty('--rx', `${5 - y * 8}deg`);
    });
    hero.addEventListener('pointerleave', () => {
      phone.style.removeProperty('--ry');
      phone.style.removeProperty('--rx');
    });
  }
}

// ── Home: the week ledger ───────────────────────────────────────────────
// A $70 weekly budget is $10 a day. Monday to Wednesday are fixed, today is
// Thursday, and the slider sets what was spent today.
const ledger = document.querySelector('[data-ledger]');
if (ledger) {
  const ALLOWANCE = 10;
  const SPENT_BEFORE_TODAY = [8, 15, 0];
  const TODAY = 3;
  const DAYS_SHOWN = 7;
  // The tallest bar: a week of allowance with nothing spent.
  const BAR_SCALE = ALLOWANCE * DAYS_SHOWN - 28;

  const slider = ledger.querySelector('input[type="range"]');
  const spentOutput = ledger.querySelector('[data-spent-output]');
  const balanceOutput = ledger.querySelector('[data-balance]');
  const status = ledger.querySelector('[data-status]');
  const rows = [...ledger.querySelectorAll('tbody tr')];
  const bars = ledger.querySelector('[data-bars]');
  const barList = rows.slice(0, DAYS_SHOWN).map((row, day) => {
    const bar = document.createElement('i');
    if (day > TODAY) bar.className = 'is-ahead';
    bars.append(bar);
    return bar;
  });

  const money = (amount) => `$${Math.abs(amount)}`;
  const signed = (amount) => (amount > 0 ? '+' : amount < 0 ? '−' : '') + money(amount);
  const sign = (amount) => (amount > 0 ? 'up' : amount < 0 ? 'down' : 'even');

  const render = () => {
    const spentToday = Number(slider.value);
    let balance = 0;
    let todayBalance = 0;

    rows.slice(0, DAYS_SHOWN).forEach((row, day) => {
      const spent = day < TODAY ? SPENT_BEFORE_TODAY[day] : day === TODAY ? spentToday : 0;
      balance += ALLOWANCE - spent;
      if (day === TODAY) {
        todayBalance = balance;
        row.cells[2].textContent = money(spent);
      }
      if (day >= TODAY) {
        const cell = row.cells[3];
        cell.textContent = signed(balance);
        cell.dataset.sign = sign(balance);
      }
      barList[day].dataset.sign = sign(balance);
      barList[day].style.setProperty('--v', Math.min(Math.abs(balance) / BAR_SCALE, 1));
    });

    spentOutput.textContent = money(spentToday);
    roll(balanceOutput, signed(todayBalance));
    balanceOutput.dataset.sign = sign(todayBalance);

    if (todayBalance > 0) {
      status.textContent = `Ahead of pace. Spend nothing more and tomorrow starts at ${signed(todayBalance + ALLOWANCE)}.`;
    } else if (todayBalance === 0) {
      status.textContent = `Right on pace. Tomorrow starts at ${signed(ALLOWANCE)}.`;
    } else {
      const days = Math.ceil(-todayBalance / ALLOWANCE);
      const intoNextWeek = TODAY + days > DAYS_SHOWN - 1;
      status.textContent = `Behind pace. Spend nothing for ${days} ${days === 1 ? 'day' : 'days'} to catch up${intoNextWeek ? ', which runs into next week' : ''}.`;
    }
  };

  slider.addEventListener('input', render);
  ledger.querySelector('[data-spend]').hidden = false;
  render();
}

// ── Home: the pinned phone ──────────────────────────────────────────────
// Each feature carries its own screenshot. On a wide screen those are put
// away and one phone is pinned beside the list; its screen changes to match
// whichever feature is crossing the middle of the window.
const tour = document.querySelector('[data-tour]');
if (tour && 'IntersectionObserver' in window) {
  const features = [...tour.querySelectorAll('.feature')];
  const wide = matchMedia('(width >= 62rem)');
  let stage;
  let active = -1;

  const setActive = (index) => {
    if (index === active) return;
    active = index;
    features.forEach((feature, n) => feature.classList.toggle('is-active', n === index));
    for (const picture of stage.querySelectorAll('picture')) {
      picture.classList.toggle('is-on', Number(picture.dataset.feature) === index);
    }
    const captions = [...features[index].querySelectorAll('figcaption')].map((caption) => caption.textContent);
    stage.classList.toggle('has-b', captions.length > 1);
    stage.querySelector('.stage-device-b').tabIndex = captions.length > 1 ? 0 : -1;
    stage.querySelector('.stage-caption').textContent = captions.join(' and ');
  };

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) setActive(features.indexOf(entry.target));
    }
  }, { rootMargin: '-50% 0px -50% 0px' });

  const build = () => {
    stage = document.createElement('div');
    stage.className = 'tour-stage';
    stage.innerHTML = `
      <div class="stage-devices">
        <button type="button" class="device stage-device" data-slot="0" aria-label="Enlarge screenshot"><span class="device-screen"></span></button>
        <button type="button" class="device stage-device stage-device-b" data-slot="1" aria-label="Enlarge second screenshot" tabindex="-1"><span class="device-screen"></span></button>
      </div>
      <p class="stage-caption" aria-hidden="true"></p>`;

    features.forEach((feature, index) => {
      feature.querySelectorAll('.shot').forEach((shot, slot) => {
        const picture = shot.querySelector('picture').cloneNode(true);
        picture.dataset.feature = index;
        for (const node of picture.querySelectorAll('[sizes]')) node.sizes = '20rem';
        stage.querySelector(`[data-slot="${slot}"] .device-screen`).append(picture);
      });
    });

    // The pinned phone opens the same enlarged view as the screenshot it stands in for.
    stage.addEventListener('click', (event) => {
      const device = event.target.closest('[data-slot]');
      if (device) features[active]?.querySelectorAll('.shot')[device.dataset.slot]?.click();
    });
    tour.append(stage);
  };

  const apply = () => {
    if (wide.matches) {
      if (!stage) build();
      tour.classList.add('is-pinned');
      if (active < 0) setActive(0);
      for (const feature of features) observer.observe(feature);
    } else {
      tour.classList.remove('is-pinned');
      observer.disconnect();
    }
  };
  wide.addEventListener('change', apply);
  apply();
}

// ── Screenshots: open the larger image in a dialog ──────────────────────
// Each screenshot is a plain link to the image file. With script, the link
// opens a native modal dialog instead: the browser supplies focus handling,
// Esc, the backdrop and the return of focus.
const shots = [...document.querySelectorAll('a[data-zoom]')];
if (shots.length && 'showModal' in HTMLDialogElement.prototype) {
  let dialog;
  let current = 0;

  const build = () => {
    dialog = document.createElement('dialog');
    dialog.className = 'zoom';
    dialog.setAttribute('aria-label', 'Screenshot');
    // Click outside to close, where the browser supports it.
    dialog.setAttribute('closedby', 'any');
    dialog.innerHTML = `
      <div data-zoom-image></div>
      <div class="zoom-bar">
        <button type="button" data-zoom-step="-1" aria-label="Previous screenshot">&#8249;</button>
        <button type="button" data-zoom-step="1" aria-label="Next screenshot">&#8250;</button>
        <p data-zoom-count></p>
        <form method="dialog"><button autofocus>Close</button></form>
      </div>`;
    document.body.append(dialog);

    dialog.addEventListener('click', (event) => {
      const step = event.target.closest('[data-zoom-step]');
      if (step) return show(current + Number(step.dataset.zoomStep));

      // Fallback for browsers without closedby: a click that lands on the
      // dialog element but outside its box was a click on the backdrop.
      if ('closedBy' in HTMLDialogElement.prototype || event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside = event.clientX >= box.left && event.clientX <= box.right
        && event.clientY >= box.top && event.clientY <= box.bottom;
      if (!inside) dialog.close();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') show(current - 1);
      if (event.key === 'ArrowRight') show(current + 1);
    });
  };

  const show = (index) => {
    if (index < 0 || index >= shots.length) return;
    current = index;

    // Reuse the link's own <picture>, asking for the largest candidate.
    const picture = shots[index].querySelector('picture').cloneNode(true);
    const image = picture.querySelector('img');
    image.removeAttribute('loading');
    image.removeAttribute('fetchpriority');
    for (const node of picture.querySelectorAll('[sizes]')) node.sizes = '100vw';
    dialog.querySelector('[data-zoom-image]').replaceChildren(picture);

    dialog.querySelector('[data-zoom-step="-1"]').disabled = index === 0;
    dialog.querySelector('[data-zoom-step="1"]').disabled = index === shots.length - 1;
    dialog.querySelector('[data-zoom-count]').textContent = `${index + 1} of ${shots.length}`;
  };

  shots.forEach((shot, index) => {
    shot.addEventListener('click', (event) => {
      // Leave modified clicks alone so the image can still open in a new tab.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (!dialog) build();
      show(index);
      dialog.showModal();
    });
  });
}

// ── Getting started: mark the section in view in the contents list ──────
// Where the browser tracks this itself (scroll-target-group), only mirror the
// state into aria-current. Elsewhere, an IntersectionObserver does both.
const toc = document.querySelector('[data-toc]');
if (toc) {
  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const mark = (active) => {
    for (const link of links) {
      if (link === active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };

  if (CSS.supports('scroll-target-group: auto')) {
    const sync = () => mark(toc.querySelector('a:target-current'));
    // The state exists once the first frame is laid out, then after each scroll.
    requestAnimationFrame(sync);
    document.addEventListener('scrollend', sync);
  } else {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const active = links.find((link) => link.hash === `#${entry.target.id}`);
        for (const link of links) link.classList.toggle('target-current', link === active);
        mark(active);
      }
    }, { rootMargin: '-35% 0px -60% 0px', threshold: 0 });

    for (const link of links) {
      const section = document.getElementById(link.hash.slice(1));
      if (section) observer.observe(section);
    }
  }
}
