// ── Business configuration ──
// Edit the values below to match how Softique Beauty Nail actually operates.
// Nothing here requires touching the booking logic itself.

export const TIMEZONE = 'Europe/Rome';

// Treatments offered online. `duration` is in minutes and drives how long a
// slot is blocked on the calendar (feel free to tune these).
export const SERVICES = [
  { id: 'nail-art', name: 'Nail Art & Design', duration: 90, description: 'Creazioni uniche e personalizzate' },
  { id: 'manicure-pedicure', name: 'Manicure & Pedicure estetica', duration: 60, description: 'Cura completa mani e piedi' },
  { id: 'copertura-gel', name: 'Copertura gel', duration: 60, description: 'Unghie naturali rinforzate in gel' },
  { id: 'semipermanente', name: 'Semipermanente', duration: 75, description: 'Classico o con rinforzo' },
];

// Opening hours per weekday. 0 = Sunday ... 6 = Saturday.
// Set a day to `null` to mark the studio as closed.
export const BUSINESS_HOURS = {
  0: null,
  1: { open: '14:30', close: '19:00' },
  2: { open: '14:30', close: '19:00' },
  3: { open: '14:30', close: '19:00' },
  4: { open: '14:30', close: '19:00' },
  5: { open: '14:30', close: '19:00' },
  6: null,
};

// Granularity of the slots proposed to the customer (minutes).
export const SLOT_STEP_MINUTES = 15;

// Cleanup / prep time reserved after every appointment, blocked on the
// calendar together with the service duration so two bookings never overlap.
export const BUFFER_MINUTES = 10;

// Customers cannot book an appointment that starts sooner than this.
export const MIN_LEAD_MINUTES = 120;

// How many days in advance customers are allowed to book.
export const BOOKING_HORIZON_DAYS = 45;

// Max bookings requests accepted from the same IP in the rate-limit window.
export const RATE_LIMIT_MAX = 8;
export const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;

export function getServiceById(id) {
  return SERVICES.find((s) => s.id === id) || null;
}
