// ── Booking widget: service → date/time → contact info → confirmation ──
(function () {
  const MONTH_NAMES_IT = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
  ];
  const WEEKDAY_SHORT_IT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const AVAILABILITY_DAYS = 45; // must stay <= BOOKING_HORIZON_DAYS on the worker

  const modal = document.getElementById('booking-modal');
  if (!modal) return;

  const overlay = document.getElementById('booking-overlay');
  const closeBtn = document.getElementById('booking-close');
  const servicesEl = document.getElementById('booking-services');
  const suggestedEl = document.getElementById('booking-suggested');
  const calPrev = document.getElementById('cal-prev');
  const calNext = document.getElementById('cal-next');
  const calMonthLabel = document.getElementById('cal-month-label');
  const calGrid = document.getElementById('cal-grid');
  const slotsLabel = document.getElementById('booking-slots-label');
  const slotsEl = document.getElementById('booking-slots');
  const summaryEl = document.getElementById('booking-summary');
  const form = document.getElementById('booking-form');
  const errorEl = document.getElementById('booking-error');
  const successText = document.getElementById('booking-success-text');
  const gcalLink = document.getElementById('booking-gcal-link');
  const backBtn = document.getElementById('booking-back');
  const nextBtn = document.getElementById('booking-next');
  const progressSteps = Array.from(document.querySelectorAll('.booking-progress-step'));
  const stepSections = Array.from(document.querySelectorAll('.booking-step'));

  const state = {
    step: 1,
    services: null,
    selectedService: null,
    availability: null, // { days: [...], nextAvailable }
    viewMonth: null, // { year, month }
    selectedDate: null,
    selectedSlot: null,
    submitting: false,
  };

  function todayLocal() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }

  function dateKey(y, m, d) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function formatDateHuman(key) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const weekday = date.toLocaleDateString('it-IT', { weekday: 'long' });
    return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${d} ${MONTH_NAMES_IT[m - 1]} ${y}`;
  }

  // ── Modal open/close ──
  function openModal() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    resetState();
    loadServices();
    document.addEventListener('keydown', onKeydown);
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') closeModal();
  }

  document.querySelectorAll('.js-open-booking').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });
  overlay.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);

  // ── State / step management ──
  function resetState() {
    state.step = 1;
    state.selectedService = null;
    state.availability = null;
    state.selectedDate = null;
    state.selectedSlot = null;
    state.submitting = false;
    const t = todayLocal();
    state.viewMonth = { year: t.year, month: t.month };
    form.reset();
    hideError();
    goToStep(1);
  }

  function goToStep(step) {
    state.step = step;
    stepSections.forEach((sec) => {
      sec.hidden = Number(sec.dataset.step) !== step;
    });
    progressSteps.forEach((el) => {
      const s = Number(el.dataset.step);
      el.classList.toggle('active', s === step);
      el.classList.toggle('done', s < step);
    });
    backBtn.hidden = step === 1 || step === 4;
    nextBtn.hidden = step === 4;
    nextBtn.textContent = step === 3 ? 'Confermo la prenotazione →' : 'Avanti →';
    updateNextEnabled();
    if (step === 2) ensureAvailabilityLoaded();
    if (step === 3) renderSummary();
  }

  function updateNextEnabled() {
    if (state.step === 1) nextBtn.disabled = !state.selectedService;
    else if (state.step === 2) nextBtn.disabled = !(state.selectedDate && state.selectedSlot);
    else nextBtn.disabled = state.submitting;
  }

  backBtn.addEventListener('click', () => goToStep(Math.max(1, state.step - 1)));
  nextBtn.addEventListener('click', () => {
    if (state.step === 1) goToStep(2);
    else if (state.step === 2) goToStep(3);
    else if (state.step === 3) submitBooking();
  });

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
  function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  // ── Step 1: services ──
  async function loadServices() {
    if (state.services) {
      renderServices();
      return;
    }
    servicesEl.innerHTML = '<p class="booking-loading">Caricamento servizi…</p>';
    try {
      const res = await fetch('/api/services');
      if (!res.ok) throw new Error('services fetch failed');
      const data = await res.json();
      state.services = data.services;
      renderServices();
    } catch (err) {
      servicesEl.innerHTML = '<p class="booking-loading">Impossibile caricare i servizi. Riprova più tardi o contattaci su WhatsApp.</p>';
    }
  }

  function renderServices() {
    servicesEl.innerHTML = '';
    state.services.forEach((service) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'booking-service-card';
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', 'false');
      if (state.selectedService && state.selectedService.id === service.id) {
        card.classList.add('selected');
        card.setAttribute('aria-checked', 'true');
      }
      card.innerHTML = `
        <span>
          <span class="booking-service-name">${service.name}</span>
          <span class="booking-service-desc">${service.description || ''}</span>
        </span>
        <span class="booking-service-duration">${service.duration} min</span>
      `;
      card.addEventListener('click', () => {
        state.selectedService = service;
        // Selecting a different service invalidates any cached availability/slot.
        state.availability = null;
        state.selectedDate = null;
        state.selectedSlot = null;
        renderServices();
        updateNextEnabled();
      });
      servicesEl.appendChild(card);
    });
  }

  // ── Step 2: date & time ──
  async function ensureAvailabilityLoaded() {
    if (state.availability) return;
    calGrid.innerHTML = '<p class="booking-loading">Caricamento disponibilità…</p>';
    suggestedEl.hidden = true;
    try {
      const t = todayLocal();
      const from = dateKey(t.year, t.month, t.day);
      const res = await fetch(
        `/api/availability?serviceId=${encodeURIComponent(state.selectedService.id)}&from=${from}&days=${AVAILABILITY_DAYS}`
      );
      if (!res.ok) throw new Error('availability fetch failed');
      const data = await res.json();
      state.availability = data;
      renderSuggested();
      renderCalendar();
    } catch (err) {
      calGrid.innerHTML = '';
      slotsLabel.textContent = 'Impossibile caricare la disponibilità. Riprova più tardi o contattaci su WhatsApp.';
    }
  }

  function renderSuggested() {
    const next = state.availability && state.availability.nextAvailable;
    if (!next) {
      suggestedEl.hidden = true;
      return;
    }
    suggestedEl.hidden = false;
    suggestedEl.innerHTML = `✦ Prossima disponibilità: <strong>${formatDateHuman(next.date)} alle ${next.start}</strong> — clicca per selezionare`;
    suggestedEl.onclick = () => {
      const [y, m] = next.date.split('-').map(Number);
      state.viewMonth = { year: y, month: m };
      selectDate(next.date);
    };
  }

  function dayInfo(key) {
    return state.availability.days.find((d) => d.date === key) || null;
  }

  function renderCalendar() {
    const { year, month } = state.viewMonth;
    calMonthLabel.textContent = `${MONTH_NAMES_IT[month - 1]} ${year}`;

    const t = todayLocal();
    const horizonEnd = new Date(t.year, t.month - 1, t.day + AVAILABILITY_DAYS - 1);
    const firstOfView = new Date(year, month - 1, 1);
    const firstOfCurrentMonth = new Date(t.year, t.month - 1, 1);
    calPrev.disabled = firstOfView <= firstOfCurrentMonth;
    const firstOfNextView = new Date(year, month, 1);
    calNext.disabled = firstOfNextView > horizonEnd;

    calGrid.innerHTML = '';
    const firstWeekday = (firstOfView.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let i = 0; i < firstWeekday; i++) {
      const empty = document.createElement('span');
      empty.className = 'cal-day empty';
      calGrid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(year, month, d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day';
      btn.textContent = String(d);

      const cellDate = new Date(year, month - 1, d);
      const isToday = cellDate.toDateString() === new Date().toDateString();
      if (isToday) btn.classList.add('today');

      const info = dayInfo(key);
      const inPast = cellDate < new Date(t.year, t.month - 1, t.day);
      const beyondHorizon = cellDate > horizonEnd;

      if (inPast || beyondHorizon || !info || info.closed || info.slots.length === 0) {
        btn.classList.add('disabled');
        btn.disabled = true;
      } else {
        btn.classList.add('available');
        btn.addEventListener('click', () => selectDate(key));
      }

      if (state.selectedDate === key) btn.classList.add('selected');
      btn.setAttribute('aria-label', formatDateHuman(key));
      calGrid.appendChild(btn);
    }
  }

  function selectDate(key) {
    state.selectedDate = key;
    state.selectedSlot = null;
    renderCalendar();
    renderSlots();
    updateNextEnabled();
  }

  function renderSlots() {
    const info = state.selectedDate ? dayInfo(state.selectedDate) : null;
    if (!info) {
      slotsLabel.textContent = 'Seleziona un giorno per vedere gli orari disponibili';
      slotsEl.innerHTML = '';
      return;
    }
    slotsLabel.textContent = `Orari disponibili — ${formatDateHuman(state.selectedDate)}`;
    slotsEl.innerHTML = '';
    info.slots.forEach((slot) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'booking-slot-btn';
      btn.textContent = slot.start;
      if (state.selectedSlot && state.selectedSlot.start === slot.start) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        state.selectedSlot = slot;
        renderSlots();
        updateNextEnabled();
      });
      slotsEl.appendChild(btn);
    });
  }

  calPrev.addEventListener('click', () => {
    state.viewMonth.month -= 1;
    if (state.viewMonth.month < 1) { state.viewMonth.month = 12; state.viewMonth.year -= 1; }
    renderCalendar();
  });
  calNext.addEventListener('click', () => {
    state.viewMonth.month += 1;
    if (state.viewMonth.month > 12) { state.viewMonth.month = 1; state.viewMonth.year += 1; }
    renderCalendar();
  });

  // ── Step 3: summary + contact form ──
  function renderSummary() {
    if (!state.selectedService || !state.selectedDate || !state.selectedSlot) return;
    summaryEl.innerHTML = `
      <div><strong>${state.selectedService.name}</strong> (${state.selectedService.duration} min)</div>
      <div>${formatDateHuman(state.selectedDate)}</div>
      <div>Ore ${state.selectedSlot.start} – ${state.selectedSlot.end}</div>
    `;
  }

  async function submitBooking() {
    hideError();
    if (!form.reportValidity()) return;

    const payload = {
      serviceId: state.selectedService.id,
      date: state.selectedDate,
      start: state.selectedSlot.start,
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      notes: form.elements.notes.value.trim(),
      honeypot: form.elements.company.value.trim(),
      requestId: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    };

    state.submitting = true;
    nextBtn.disabled = true;
    nextBtn.textContent = 'Invio in corso…';

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          showError('Questo orario è stato appena prenotato da qualcun altro. Scegli un altro orario.');
          state.availability = null;
          state.selectedSlot = null;
          goToStep(2);
          await ensureAvailabilityLoaded();
        } else {
          showError(data.error || 'Si è verificato un errore. Riprova o contattaci su WhatsApp.');
        }
        return;
      }

      showConfirmation(data);
    } catch (err) {
      showError('Connessione non riuscita. Controlla la rete e riprova.');
    } finally {
      state.submitting = false;
      nextBtn.disabled = false;
      nextBtn.textContent = 'Confermo la prenotazione →';
    }
  }

  function buildGoogleCalendarLink() {
    const [y, m, d] = state.selectedDate.split('-').map(Number);
    const [sh, sm] = state.selectedSlot.start.split(':').map(Number);
    const start = new Date(y, m - 1, d, sh, sm);
    const end = new Date(start.getTime() + state.selectedService.duration * 60000);
    const fmt = (dt) =>
      `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}${String(dt.getMinutes()).padStart(2, '0')}00`;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${state.selectedService.name} — Softique Beauty Nail`,
      dates: `${fmt(start)}/${fmt(end)}`,
      details: 'Appuntamento presso Softique Beauty Nail, Via Antonio Magri 3/A, Rovetta (BG).',
      location: 'Via Antonio Magri, 3/A, 24020 Rovetta (BG)',
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function showConfirmation() {
    successText.textContent = `${state.selectedService.name} — ${formatDateHuman(state.selectedDate)} alle ${state.selectedSlot.start}. Ti contatteremo a breve per confermare l'appuntamento.`;
    gcalLink.href = buildGoogleCalendarLink();
    goToStep(4);
  }
})();
