// ============================================================
// BlackChicken HR — Apps Script del Sheet "BC HR Data"
// Vinculado a la planilla (Extensiones → Apps Script). NO usa SHEET_ID.
// Funciones:
//  - doGet            : entrega la pestaña Equipo como JSON (lo lee el dashboard)
//  - syncOrganigrama  : trae estructura del Organigrama y actualiza Equipo
//  - crearTriggerDiario: instala la sync automática diaria (correr 1 vez)
//  - onOpen           : agrega menú "🔄 Dotación → Sincronizar ahora"
// El Organigrama manda en: nombre, cargo, local. Se PRESERVAN sueldo_bruto y jornada.
// ============================================================

var ORG_API = 'https://bc-organigrama.vercel.app/api/organigrama';

// ---------- API para el dashboard ----------
function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function sheetToJSON(sheet) {
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
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
function norm(s) { return String(s || '').trim().toLowerCase(); }

function syncOrganigrama() {
  var sh = getSheet('Equipo');
  if (!sh) throw new Error('No existe la pestaña Equipo');

  var resp = UrlFetchApp.fetch(ORG_API, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('Organigrama respondió ' + resp.getResponseCode());
  var org = JSON.parse(resp.getContentText());
  var sections = (org.data && org.data.sections) || [];

  // Aplanar personas del organigrama → {nombre, cargo, local}
  // row (Dirección/Gestión) = Backoffice · split = grupo[0] BC1, grupo[1] BC2
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

  var rowByName = {};
  for (var i = 1; i < data.length; i++) {
    var nm = norm(data[i][col['nombre']]);
    if (nm) rowByName[nm] = i;
  }

  var seen = {}, nuevos = 0, actualizados = 0, bajas = 0;

  // Upsert
  desired.forEach(function (d) {
    var key = norm(d.nombre); seen[key] = true;
    if (rowByName[key] != null) {
      var r = rowByName[key];
      sh.getRange(r + 1, col['cargo'] + 1).setValue(d.cargo);
      sh.getRange(r + 1, col['local'] + 1).setValue(d.local);
      if (col['estado'] != null && norm(data[r][col['estado']]) === 'baja') {
        sh.getRange(r + 1, col['estado'] + 1).setValue('Activo');
      }
      actualizados++;
    } else {
      var row = headers.map(function (h) {
        if (h === 'nombre') return d.nombre;
        if (h === 'cargo') return d.cargo;
        if (h === 'local') return d.local;
        if (h === 'jornada') return 'Full';
        if (h === 'estado') return 'Activo';
        if (h === 'tipo_contrato') return 'Indefinido';
        return '';
      });
      sh.appendRow(row);
      nuevos++;
    }
  });

  // Marcar bajas: en el Sheet pero ya no en el organigrama
  for (var i = 1; i < data.length; i++) {
    var nm = norm(data[i][col['nombre']]);
    if (!nm) continue;
    if (!seen[nm] && col['estado'] != null && norm(data[i][col['estado']]) !== 'baja') {
      sh.getRange(i + 1, col['estado'] + 1).setValue('Baja');
      bajas++;
    }
  }

  Logger.log('Sync OK · nuevos:' + nuevos + ' actualizados:' + actualizados + ' bajas:' + bajas);
  return { nuevos: nuevos, actualizados: actualizados, bajas: bajas };
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
