// ============================================================
// BlackChicken HR — Apps Script del Sheet "BC HR Data"
// Vinculado a la planilla (Extensiones → Apps Script). NO usa SHEET_ID.
//  - doGet            : entrega la pestaña Equipo como JSON (lo lee el dashboard)
//  - syncOrganigrama  : trae estructura del Organigrama y reescribe Equipo SIN duplicados
//  - crearTriggerDiario: instala la sync automática diaria (correr 1 vez)
//  - onOpen           : menú "🔄 Dotación → Sincronizar ahora"
// El Organigrama manda en: nombre, cargo, local. Se PRESERVAN sueldo_bruto y jornada.
// ============================================================

var ORG_API = 'https://bc-organigrama.vercel.app/api/organigrama';

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function norm(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // ignora tildes/acentos
}

// ---------- API para el dashboard ----------
function sheetToJSON(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    if (!String(data[i][0] || '').trim()) continue; // saltar filas vacías
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      row[headers[j]] = val;
    }
    rows.push(row);
  }
  return rows;
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify(sheetToJSON(getSheet('Equipo'))))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Sincronización desde el Organigrama ----------
function syncOrganigrama() {
  var sh = getSheet('Equipo');
  if (!sh) throw new Error('No existe la pestaña Equipo');

  var resp = UrlFetchApp.fetch(ORG_API, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('Organigrama respondió ' + resp.getResponseCode());
  var org = JSON.parse(resp.getContentText());
  var sections = (org.data && org.data.sections) || [];

  // Aplanar personas: row = Backoffice · split = grupo[0] BC1, grupo[1] BC2
  var desired = [];
  sections.forEach(function (s) {
    (s.groups || []).forEach(function (g, gi) {
      (g.people || []).forEach(function (p) {
        var nombre = (p.name || '').trim();
        if (!nombre) return;
        var local = (s.layout === 'split') ? (gi === 0 ? 'BC1' : 'BC2') : 'Backoffice';
        desired.push({ nombre: nombre, cargo: (p.role || '').trim(), local: local });
      });
    });
  });
  if (!desired.length) throw new Error('El organigrama no devolvió personas');

  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var col = {}; headers.forEach(function (h, i) { col[h] = i; });
  if (col['nombre'] == null) throw new Error('Falta la columna nombre');

  // Colapsar filas existentes por nombre normalizado (merge de duplicados)
  var MANUAL = ['sueldo_bruto', 'jornada', 'fecha_ingreso', 'cumpleanos', 'tipo_contrato', 'email', 'telefono'];
  var existing = {};
  for (var i = 1; i < data.length; i++) {
    var nm = norm(data[i][col['nombre']]);
    if (!nm) continue;
    var obj = {}; headers.forEach(function (h, j) { obj[h] = data[i][j]; });
    if (existing[nm]) {
      var e = existing[nm];
      MANUAL.forEach(function (k) {
        if ((e[k] === '' || e[k] == null) && obj[k] !== '' && obj[k] != null) e[k] = obj[k];
      });
      if (norm(obj['estado']) === 'activo') e['estado'] = obj['estado'];
    } else {
      existing[nm] = obj;
    }
  }

  function buildRow(o) { return headers.map(function (h) { return (o[h] == null ? '' : o[h]); }); }

  var orgKeys = {}, finalRows = [];
  desired.forEach(function (d) {
    var k = norm(d.nombre); orgKeys[k] = true;
    var base = existing[k] || {};
    var o = {};
    headers.forEach(function (h) { o[h] = (base[h] == null ? '' : base[h]); });
    o['nombre'] = d.nombre;          // organigrama manda en la grafía del nombre
    o['cargo'] = d.cargo;
    o['local'] = d.local;
    o['estado'] = 'Activo';
    if (!o['jornada']) o['jornada'] = 'Full';
    if (!o['tipo_contrato']) o['tipo_contrato'] = 'Indefinido';
    finalRows.push(buildRow(o));
  });

  // Existentes que ya no están en el organigrama → Baja (conserva su data)
  Object.keys(existing).forEach(function (k) {
    if (orgKeys[k]) return;
    var e = existing[k]; e['estado'] = 'Baja';
    finalRows.push(buildRow(e));
  });

  // Reescribir la pestaña: headers intactos, filas limpias y SIN duplicados
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, headers.length).clearContent();
  if (finalRows.length) sh.getRange(2, 1, finalRows.length, headers.length).setValues(finalRows);

  Logger.log('Sync OK · activos:' + desired.length + ' filas:' + finalRows.length);
  return { activos: desired.length, filas: finalRows.length };
}

// ---------- Setup (correr 1 vez) ----------
function crearTriggerDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncOrganigrama') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncOrganigrama').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Trigger diario creado (6 AM).');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 Dotación')
    .addItem('Sincronizar desde Organigrama ahora', 'syncOrganigrama')
    .create();
}
