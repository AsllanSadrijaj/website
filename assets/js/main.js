/* SCANDIUM AG – Navigation, Menü, Reveal */
(function () {
  document.documentElement.classList.remove('no-js');

  // Navigation: Hintergrund nach dem Scrollen
  var nav = document.querySelector('.nav');
  function onScroll() {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 12);
    document.body.classList.toggle('past-hero', window.scrollY > window.innerHeight * 0.5);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Navigation über hellen Sektionen
  var lights = document.querySelectorAll('.section-light, .memberbar');
  if (nav && lights.length && 'IntersectionObserver' in window) {
    var onLight = new Set();
    var lo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) onLight.add(en.target); else onLight.delete(en.target); });
      nav.classList.toggle('on-light', onLight.size > 0 && !document.body.classList.contains('menu-open'));
    }, { rootMargin: '0px 0px -94% 0px', threshold: 0 });
    lights.forEach(function (el) { lo.observe(el); });
  }

  // Mobiles Menü
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('menu');
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (menu) menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      setMenu(!document.body.classList.contains('menu-open'));
    });
  }
  if (menu) {
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 820) setMenu(false);
  });

  // Einblenden beim Scrollen
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  // Begrüssung aus der Akquise-Mail: ?f=Firmenname
  try {
    var greet = document.querySelector('[data-greet]');
    var f = new URLSearchParams(window.location.search).get('f');
    if (greet && f) {
      f = f.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
      if (f) greet.textContent = 'Für ' + f;
    }
  } catch (e) {}

  // Fixierte Termin-Leiste auf dem Handy
  var book = document.querySelector('a.btn-primary[href*="bookings.cloud.microsoft"]');
  if (book && !document.body.hasAttribute('data-no-sticky')) {
    var bar = document.createElement('div');
    bar.className = 'sticky-cta';
    bar.setAttribute('aria-label', 'Kontakt');
    var a1 = document.createElement('a');
    a1.className = 's-book'; a1.href = book.href; a1.target = '_blank'; a1.rel = 'noopener'; a1.textContent = 'Termin wählen';
    var a2 = document.createElement('a');
    a2.className = 's-call'; a2.href = 'tel:+41442440209'; a2.textContent = 'Anrufen';
    bar.appendChild(a1); bar.appendChild(a2);
    document.body.appendChild(bar);
    document.body.classList.add('has-sticky');
    var heroCta = document.querySelector('.hero .cta');
    var stop = document.querySelector('.closing') || document.querySelector('footer');
    var heroGone = false, stopIn = false;
    var upd = function () { bar.classList.toggle('show', heroGone && !stopIn && !document.body.classList.contains('menu-open')); };
    if ('IntersectionObserver' in window) {
      if (heroCta) new IntersectionObserver(function (e) { heroGone = !e[0].isIntersecting && e[0].boundingClientRect.top < 0; upd(); }).observe(heroCta);
      else heroGone = true;
      if (stop) new IntersectionObserver(function (e) { stopIn = e[0].isIntersecting; upd(); }).observe(stop);
    }
  }

  // Jahr im Footer
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();
