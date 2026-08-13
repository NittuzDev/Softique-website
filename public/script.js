const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });
reveals.forEach(el => observer.observe(el));

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const href = a.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// Hamburger menu
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
    document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
  });
  document.querySelectorAll('.menu-link').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}


window.addEventListener('scroll', () => {
const nav = document.querySelector('nav');
nav.classList.toggle('scrolled', window.scrollY > 50);
});

(function() {
  const slides  = document.querySelectorAll('.gallery-slide');
  const dots    = document.querySelectorAll('.gallery-dot');
  const prev    = document.getElementById('gallery-prev');
  const next    = document.getElementById('gallery-next');
  const TOTAL   = slides.length;
  let current   = 0;
  let timer     = null;
  let paused    = false;
  let animating = false;

  function isMobile() { return window.innerWidth <= 768; }

  // Pulisci ogni stile inline lasciato dagli script precedenti
  slides.forEach((s, i) => {
    s.removeAttribute('style');
    s.className = 'gallery-slide' + (i === 0 ? ' active' : '');
  });

  function updateDots() {
    dots.forEach((d, i) => {
      d.style.background = i === current ? 'var(--deep)' : 'var(--blush)';
      d.style.width      = i === current ? '28px' : '14px';
    });
  }

  function goTo(index, direction) {
    if (animating) return;
    const to  = (index + TOTAL) % TOTAL;
    if (to === current) return;
    animating = true;

    const from    = current;
    const enterClass = direction > 0 ? 'enter-right' : 'enter-left';
    const exitClass  = direction > 0 ? 'exit-left'   : 'exit-right';

    // Prepara la slide entrante fuori campo (senza transizione)
    slides[to].style.transition = 'none';
    slides[to].className = 'gallery-slide ' + enterClass;

    requestAnimationFrame(() => requestAnimationFrame(() => {
      slides[to].style.transition = '';

      // Avvia uscita e entrata insieme
      slides[from].className = 'gallery-slide ' + exitClass;
      slides[to].className   = 'gallery-slide active';

      // Reset scroll on incoming grid for mobile
      const toGrid = slides[to].querySelector('.gallery-grid');
      if (toGrid) toGrid.scrollLeft = 0;

      current = to;
      updateDots();

      setTimeout(() => {
        // Pulisci la slide uscita
        slides[from].className = 'gallery-slide';
        animating = false;
      }, 1100);
    }));
  }

  function scheduleNext() {
    clearTimeout(timer);
    if (!paused) {
      timer = setTimeout(() => {
        goTo(current + 1, 1);
        scheduleNext();
      }, 5000);
    }
  }

  // Restituisce il wrapper su mobile, null su desktop
  function getScroller() {
    return isMobile() ? document.querySelector('.gallery-carousel-wrapper') : null;
  }

  // Calcola la larghezza di un "passo" (= larghezza dello scroller)
  function stepWidth(scroller) {
    return scroller.clientWidth;
  }

  // Naviga di +1 o -1 foto con scroll fluido (mobile)
  function mobileNavigate(dir) {
    const scroller = getScroller();
    if (!scroller) return;

    const w = stepWidth(scroller);

    // 1. Calcola l'indice della foto su cui ci troviamo ora (0 = prima foto)
    const currentIndex = Math.round(scroller.scrollLeft / w);

    // 2. Conta il numero totale di foto presenti nel carosello mobile
    const totalItems = scroller.querySelectorAll('.gallery-item').length;

    // Controllo di Fine/Inizio Corsa basato sugli indici
    if (dir === 1 && currentIndex >= totalItems - 1) {
      // Se andiamo "Avanti" e siamo all'ultima foto, torna alla prima (indice 0)
      scroller.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    } else if (dir === -1 && currentIndex <= 0) {
      // Se andiamo "Indietro" e siamo alla prima foto, vai all'ultima
      scroller.scrollTo({ left: (totalItems - 1) * w, behavior: 'smooth' });
      return;
    }

    // Scorrimento standard
    scroller.scrollBy({ left: dir * w, behavior: 'smooth' });
  }

  // Naviga di +1/-1: su mobile scorre lo scroller flat, su desktop cambia slide
  function handleNavClick(dir) {
    if (isMobile()) {
      mobileNavigate(dir);
    } else {
      goTo(current + dir, dir);
      scheduleNext();
    }
  }

  prev.addEventListener('click', () => handleNavClick(-1));
  next.addEventListener('click', () => handleNavClick(1));
  dots.forEach(d => d.addEventListener('click', () => {
    const idx = +d.dataset.index;
    goTo(idx, idx >= current ? 1 : -1);
    scheduleNext();
  }));

  const gallerySection = document.getElementById('gallery');
  gallerySection.addEventListener('mouseenter', () => { paused = true;  clearTimeout(timer); });
  gallerySection.addEventListener('mouseleave', () => { paused = false; scheduleNext(); });

  [prev, next].forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--rose)';
      btn.querySelector('svg').style.stroke = 'var(--white)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'var(--white)';
      btn.querySelector('svg').style.stroke = 'var(--deep)';
    });
  });

  updateDots();
  scheduleNext();

  // Swipe con velocità controllata (scroll momentum ridotto), solo mobile
  (function() {
    const scroller = document.querySelector('.gallery-carousel-wrapper');
    if (!scroller) return;

    let startX = null;
    let startScroll = null;
    let isDragging = false;

    scroller.addEventListener('touchstart', function(e) {
      if (!isMobile()) return;
      startX = e.touches[0].clientX;
      startScroll = scroller.scrollLeft;
      isDragging = true;
      // Disabilita temporaneamente scroll-behavior smooth per il drag diretto
      scroller.style.scrollBehavior = 'auto';
    }, { passive: true });

    scroller.addEventListener('touchmove', function(e) {
      if (!isMobile() || !isDragging || startX === null) return;
      const dx = startX - e.touches[0].clientX;
      // Segui il dito 1:1 ma con attrito (fattore 0.8 per rallentare leggermente)
      scroller.scrollLeft = startScroll + dx * 0.85;
    }, { passive: true });

    scroller.addEventListener('touchend', function(e) {
      if (!isMobile() || !isDragging) return;
      isDragging = false;
      const dx = startX - e.changedTouches[0].clientX;
      const w = stepWidth(scroller);

      // Riaabilita smooth per lo snap finale
      scroller.style.scrollBehavior = 'smooth';

      // Snap alla foto più vicina in base alla direzione del gesto
      // Soglia bassa (15% larghezza) = gesto amichevole
      const threshold = w * 0.15;
      let target;
      if (dx > threshold) {
        // Swipe sinistra → foto successiva
        target = Math.ceil(scroller.scrollLeft / w) * w;
      } else if (dx < -threshold) {
        // Swipe destra → foto precedente
        target = Math.floor(scroller.scrollLeft / w) * w;
      } else {
        // Gesto troppo corto → torna alla foto corrente
        target = Math.round(scroller.scrollLeft / w) * w;
      }
      scroller.scrollTo({ left: target, behavior: 'smooth' });
      startX = null;
    }, { passive: true });
  })();
})();


(function() {
  const lightbox     = document.getElementById('lightbox');
  const lbImg        = document.getElementById('lightbox-img');
  const lbCaption    = document.getElementById('lightbox-caption');
  const lbClose      = document.getElementById('lightbox-close');
  const lbPrev       = document.getElementById('lightbox-prev');
  const lbNext       = document.getElementById('lightbox-next');

  let allItems = []; // array of {src, alt, label, element}
  let currentLb = 0;

  function buildItemList() {
    allItems = [];
    const isMobileView = window.innerWidth <= 768;
    let itemsNodeList;

    if (isMobileView) {
      // Su mobile estrae tutte le foto dalla lista in scorrimento ininterrotto
      itemsNodeList = document.querySelectorAll('.gallery-carousel-wrapper .gallery-item');
    } else {
      // Su desktop estrae le foto solo dalla slide attiva corrente
      const activeSlide = document.querySelector('.gallery-slide.active');
      itemsNodeList = activeSlide ? activeSlide.querySelectorAll('.gallery-item') : [];
    }

    itemsNodeList.forEach(item => {
      const img    = item.querySelector('img');
      const label  = item.querySelector('.gallery-item-label');
      if (img) {
        allItems.push({
          src:     img.src,
          alt:     img.alt || '',
          label:   label ? label.textContent.trim() : '',
          element: item
        });
      }
    });
  }

  function openLightbox(index) {
    buildItemList();
    if (!allItems.length) return;
    currentLb = (index + allItems.length) % allItems.length;
    const item = allItems[currentLb];
    lbImg.src         = item.src;
    lbImg.alt         = item.alt;
    lbCaption.textContent = item.label;
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    lbImg.style.opacity = '0';
    lbImg.onload = () => { lbImg.style.transition = 'opacity 0.3s'; lbImg.style.opacity = '1'; };
    if (lbImg.complete) { lbImg.style.opacity = '1'; }
    // Show/hide nav based on count
    lbPrev.style.display = allItems.length > 1 ? '' : 'none';
    lbNext.style.display = allItems.length > 1 ? '' : 'none';
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    lbImg.src = '';
  }

  function navigate(dir) {
    openLightbox(currentLb + dir);
  }

  // Delegate click on gallery items
  document.addEventListener('click', e => {
    const item = e.target.closest('.gallery-item');
    if (!item) return;
    
    // Costruisci o ricostruisci la lista prima di aprirla
    buildItemList();
    
    // Trova l'elemento cliccato usando il riferimento diretto al nodo
    const idx = allItems.findIndex(i => i.element === item);
    if (idx >= 0) openLightbox(idx);
  });

  lbClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  lbPrev.addEventListener('click', e => { e.stopPropagation(); navigate(-1); });
  lbNext.addEventListener('click', e => { e.stopPropagation(); navigate(1); });

  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')   navigate(-1);
    if (e.key === 'ArrowRight')  navigate(1);
  });

  // Touch swipe support for lightbox
  let lbTouchX = null;
  lightbox.addEventListener('touchstart', e => { lbTouchX = e.changedTouches[0].clientX; }, { passive: true });
  lightbox.addEventListener('touchend', e => {
    if (lbTouchX === null) return;
    const dx = e.changedTouches[0].clientX - lbTouchX;
    if (Math.abs(dx) > 40) navigate(dx < 0 ? 1 : -1);
    lbTouchX = null;
  });
})();

// ── FAQ accordion ──
(function() {
  document.querySelectorAll('.faq-item').forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(other => {
        if (other !== item) {
          other.classList.remove('open');
          other.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
        }
      });
      item.classList.toggle('open', !isOpen);
      question.setAttribute('aria-expanded', String(!isOpen));
    });
  });
})();
