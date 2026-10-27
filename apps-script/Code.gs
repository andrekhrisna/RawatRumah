/**
 * RawatRumah - Pengirim email pengingat otomatis (Google Apps Script)
 *
 * Alur:
 *  1. Aplikasi (index.html) mengirim daftar tugas ke skrip ini setiap ada perubahan
 *     (tambah / ubah / hapus / klik Selesai) lewat doPost().
 *  2. Setiap hari ~jam 08:00 (trigger waktu) dailyCheck() menghitung tugas dan
 *     mengirim SATU email ke pemilik jika ada yang perlu diingatkan.
 *
 * Aturan pengingat (dihitung ulang setiap hari dari data terakhir, tanpa status tersimpan):
 *  - MINGGUAN : tiap hari WEEKLY_DAY (default Senin), daftar tugas yang jatuh tempo
 *               0..UPCOMING_DAYS hari ke depan.
 *  - HARIAN   : tugas terlampaui 1..OVERDUE_MAX_DAYS hari diingatkan tiap hari.
 *               Berhenti otomatis saat Anda klik Selesai (tanggal terakhir diperbarui),
 *               atau setelah OVERDUE_MAX_DAYS hari tanpa Selesai.
 *  Jika dua kondisi itu terjadi di hari yang sama, keduanya digabung dalam satu email.
 *
 * Cara pasang: lihat apps-script/README.md
 */

// ===================== PENGATURAN (edit di salinan Anda) =====================
const SECRET = 'GANTI-DENGAN-KATA-SANDI-ACAK-ANDA'; // harus sama persis dengan yang diisi di aplikasi
const RECIPIENT = '';          // kosong = email pemilik akun Google yang memasang skrip ini
const SEND_HOUR = 8;           // jam kirim (zona waktu skrip; Apps Script mengirim di rentang jam tsb)
const WEEKLY_DAY = 1;          // 0=Minggu, 1=Senin, ... 6=Sabtu
const UPCOMING_DAYS = 7;       // jendela "akan jatuh tempo"
const OVERDUE_MAX_DAYS = 3;    // lama pengingat harian untuk tugas terlampaui
const APP_URL = 'https://andrekhrisna.github.io/RawatRumah/'; // tujuan tombol di email
// ============================================================================

const CHUNK_SIZE = 8000; // batas 1 Script Property = 9 KB
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- Endpoint untuk aplikasi ----------
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (!req || req.token !== SECRET || SECRET.indexOf('GANTI-') === 0) {
      return json_({ ok: false, error: 'Token salah atau SECRET belum diganti di skrip.' });
    }
    if (req.action === 'sync') {
      if (!Array.isArray(req.tasks)) return json_({ ok: false, error: 'Format tasks tidak valid.' });
      saveTasks_(req.tasks);
      return json_({ ok: true, count: req.tasks.length, savedAt: new Date().toISOString() });
    }
    if (req.action === 'test') {
      const result = sendDigest_(new Date(), true);
      return json_({ ok: true, sent: result.sent, overdue: result.overdue, upcoming: result.upcoming, to: recipient_() });
    }
    return json_({ ok: false, error: 'Aksi tidak dikenal.' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'RawatRumah reminder' });
}

// ---------- Dipanggil trigger harian ----------
function dailyCheck() {
  sendDigest_(new Date(), false);
}

// ---------- Jalankan SEKALI dari editor setelah deploy ----------
function setupTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'dailyCheck'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyCheck').timeBased().everyDays(1).atHour(SEND_HOUR).create();
}

// ---------- Logika inti (murni, mudah diuji) ----------
function parseDate_(str) {
  const p = String(str).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

// Sama persis dengan calculateNextDueDate() di index.html
function nextDue_(task) {
  if (!task.lastDoneDate) return new Date();
  const date = parseDate_(task.lastDoneDate);
  const val = parseInt(task.freqValue, 10) || 1;
  switch (task.freqUnit) {
    case 'WEEKS':  date.setDate(date.getDate() + val * 7); break;
    case 'MONTHS': date.setMonth(date.getMonth() + val); break;
    case 'YEARS':  date.setFullYear(date.getFullYear() + val); break;
    default:       date.setDate(date.getDate() + val); // DAYS
  }
  return date;
}

// Selisih hari ke jatuh tempo; negatif = terlampaui. Sama dengan getTaskStatus().days
function daysUntilDue_(task, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = nextDue_(task);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / DAY_MS);
}

function buildDigest_(tasks, now, force) {
  const isWeeklyDay = now.getDay() === WEEKLY_DAY;
  const overdue = [], upcoming = [];
  let stale = 0;
  tasks.forEach(function (t) {
    const d = daysUntilDue_(t, now);
    if (d < 0) {
      if (-d <= OVERDUE_MAX_DAYS) overdue.push({ task: t, days: d });
      else stale++;
    } else if (d <= UPCOMING_DAYS && (isWeeklyDay || force)) {
      upcoming.push({ task: t, days: d });
    }
  });
  overdue.sort(function (a, b) { return a.days - b.days; });
  upcoming.sort(function (a, b) { return a.days - b.days; });
  return { overdue: overdue, upcoming: upcoming, stale: stale };
}

function sendDigest_(now, force) {
  const tasks = loadTasks_();
  const digest = buildDigest_(tasks, now, force);
  const total = digest.overdue.length + digest.upcoming.length;
  if (total === 0) {
    if (force) {
      MailApp.sendEmail({
        to: recipient_(),
        subject: '[RawatRumah] Uji coba: tidak ada tugas yang perlu diingatkan hari ini',
        body: 'Sambungan berfungsi. Saat ini ada ' + tasks.length + ' tugas tersinkron, tidak ada yang terlampaui ≤' +
          OVERDUE_MAX_DAYS + ' hari atau jatuh tempo ≤' + UPCOMING_DAYS + ' hari.'
      });
      return { sent: true, overdue: 0, upcoming: 0 };
    }
    return { sent: false, overdue: 0, upcoming: 0 };
  }

  const mail = composeEmail_(digest, now, force);
  MailApp.sendEmail({
    to: recipient_(),
    subject: mail.subject,
    body: mail.text,
    htmlBody: mail.html,
    name: 'RawatRumah'
  });
  return { sent: true, overdue: digest.overdue.length, upcoming: digest.upcoming.length };
}

function composeEmail_(digest, now, force) {
  const dateLabel = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const parts = [];
  if (digest.overdue.length) parts.push(digest.overdue.length + ' terlampaui');
  if (digest.upcoming.length) parts.push(digest.upcoming.length + ' dalam ' + UPCOMING_DAYS + ' hari');
  const prefix = digest.overdue.length ? '[TERLAMPAUI] ' : '[Pengingat] ';
  const subject = (force ? '[UJI COBA] ' : '') + prefix + 'RawatRumah: ' + parts.join(', ') + ' - ' + dateLabel;

  const unitMap = { DAYS: 'Hari', WEEKS: 'Minggu', MONTHS: 'Bulan', YEARS: 'Tahun' };
  function line(item, overdue) {
    const t = item.task;
    const due = Utilities.formatDate(nextDue_(t), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    const status = overdue
      ? 'terlampaui ' + Math.abs(item.days) + ' hari (jatuh tempo ' + due + ')'
      : (item.days === 0 ? 'HARI INI (' + due + ')' : item.days + ' hari lagi (' + due + ')');
    return { name: t.name, category: t.category || '-', status: status,
      freq: 'Setiap ' + t.freqValue + ' ' + (unitMap[t.freqUnit] || t.freqUnit), notes: t.notes || '-' };
  }

  let text = '';
  let html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;max-width:560px">';

  if (digest.overdue.length) {
    text += 'TERLAMPAUI (pengingat harian sampai Anda klik Selesai, maks ' + OVERDUE_MAX_DAYS + ' hari)\n\n';
    html += '<h3 style="color:#dc2626;margin:0 0 8px">Terlampaui</h3>';
    digest.overdue.forEach(function (it, i) {
      const l = line(it, true);
      text += (i + 1) + '. ' + l.name + '\n   ' + l.status + '\n   Kategori: ' + l.category + ' | ' + l.freq + '\n   Catatan: ' + l.notes + '\n\n';
      html += card_(l, '#dc2626');
    });
  }
  if (digest.upcoming.length) {
    text += 'AKAN JATUH TEMPO DALAM ' + UPCOMING_DAYS + ' HARI\n\n';
    html += '<h3 style="color:#d97706;margin:16px 0 8px">Jatuh tempo dalam ' + UPCOMING_DAYS + ' hari</h3>';
    digest.upcoming.forEach(function (it, i) {
      const l = line(it, false);
      text += (i + 1) + '. ' + l.name + '\n   ' + l.status + '\n   Kategori: ' + l.category + ' | ' + l.freq + '\n   Catatan: ' + l.notes + '\n\n';
      html += card_(l, '#d97706');
    });
  }
  if (digest.stale > 0) {
    const note = digest.stale + ' tugas lain terlampaui lebih dari ' + OVERDUE_MAX_DAYS +
      ' hari sehingga pengingat emailnya dihentikan; tetap tampil merah di aplikasi.';
    text += note + '\n\n';
    html += '<p style="color:#64748b;font-size:12px">' + esc_(note) + '</p>';
  }
  text += 'Buka aplikasi dan klik "Selesai" setelah dikerjakan agar pengingat berhenti:\n' + APP_URL;
  html += '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 0 8px"><tr>' +
    '<td style="background:#0284c7;border-radius:8px">' +
    '<a href="' + esc_(APP_URL) + '" target="_blank" style="display:inline-block;padding:12px 24px;' +
    'font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">' +
    'Buka RawatRumah &amp; klik Selesai</a></td></tr></table>' +
    '<p style="color:#64748b;font-size:12px;margin:0">Klik <b>Selesai</b> pada tugas yang sudah dikerjakan agar pengingat berhenti.</p></div>';
  return { subject: subject, text: text, html: html };
}

function card_(l, color) {
  return '<div style="border-left:4px solid ' + color + ';background:#f8fafc;padding:8px 12px;margin-bottom:8px">' +
    '<b>' + esc_(l.name) + '</b><br>' +
    '<span style="color:' + color + '">' + esc_(l.status) + '</span><br>' +
    '<span style="color:#64748b;font-size:12px">' + esc_(l.category) + ' · ' + esc_(l.freq) + '<br>' + esc_(l.notes) + '</span></div>';
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ---------- Penyimpanan (Script Properties, dipecah per 8 KB) ----------
function saveTasks_(tasks) {
  const props = PropertiesService.getScriptProperties();
  const old = Number(props.getProperty('tasks_n') || 0);
  const raw = JSON.stringify(tasks);
  const n = Math.ceil(raw.length / CHUNK_SIZE);
  const out = { tasks_n: String(n) };
  for (let i = 0; i < n; i++) out['tasks_' + i] = raw.substr(i * CHUNK_SIZE, CHUNK_SIZE);
  props.setProperties(out);
  for (let i = n; i < old; i++) props.deleteProperty('tasks_' + i);
}

function loadTasks_() {
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty('tasks_n') || 0);
  let raw = '';
  for (let i = 0; i < n; i++) raw += props.getProperty('tasks_' + i) || '';
  return raw ? JSON.parse(raw) : [];
}

function recipient_() {
  return RECIPIENT || Session.getEffectiveUser().getEmail();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
