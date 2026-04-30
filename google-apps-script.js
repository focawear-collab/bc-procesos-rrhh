// ============================================================
// BlackChicken HR — Google Apps Script (Web App API)
// Deploy como Web App: Ejecutar como TÚ, acceso "Cualquiera"
// ============================================================

// ---- CONFIG ----
var SHEET_ID = ''; // <-- Pegar aquí el ID de tu Google Sheet

function getSheet(name) {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

// ---- HELPERS ----
function sheetToJSON(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      // Formatear fechas como YYYY-MM-DD
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      row[headers[j]] = val;
    }
    rows.push(row);
  }
  return rows;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- GET: Leer datos ----
function doGet(e) {
  var tab = (e.parameter.tab || '').toLowerCase();
  
  // Si no hay tab, devolver todo
  if (!tab) {
    return jsonResponse({
      equipo: sheetToJSON(getSheet('Equipo')),
      salidas: sheetToJSON(getSheet('Salidas')),
      eventos: sheetToJSON(getSheet('Eventos'))
    });
  }
  
  var sheetMap = {
    'equipo': 'Equipo',
    'salidas': 'Salidas',
    'eventos': 'Eventos'
  };
  
  var sheetName = sheetMap[tab];
  if (!sheetName) {
    return jsonResponse({ error: 'Tab no válida. Usa: equipo, salidas, eventos' });
  }
  
  return jsonResponse(sheetToJSON(getSheet(sheetName)));
}

// ---- POST: Agregar datos ----
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action; // 'add_equipo', 'add_salida', 'add_evento'
    
    switch (action) {
      case 'add_equipo':
        return addEquipo(body.data);
      case 'add_salida':
        return addSalida(body.data);
      case 'add_evento':
        return addEvento(body.data);
      case 'update_equipo':
        return updateEquipo(body.data);
      default:
        return jsonResponse({ error: 'Acción no válida' });
    }
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

function addEquipo(d) {
  var sheet = getSheet('Equipo');
  sheet.appendRow([
    d.nombre || '',
    d.cargo || '',
    d.local || '',
    d.jornada || 'Full time',
    d.sueldo_bruto || 0,
    d.fecha_ingreso || '',
    d.cumpleanos || '',
    d.tipo_contrato || 'Indefinido',
    d.estado || 'Activo',
    d.email || '',
    d.telefono || ''
  ]);
  return jsonResponse({ ok: true, msg: 'Miembro agregado' });
}

function addSalida(d) {
  var sheet = getSheet('Salidas');
  sheet.appendRow([
    d.nombre || '',
    d.cargo || '',
    d.local || '',
    d.fecha_salida || '',
    d.motivo || '',
    d.tipo || 'Voluntaria',
    d.tiempo_en_bc || '',
    d.comentarios || ''
  ]);
  // Marcar como Inactivo en Equipo
  var eq = getSheet('Equipo');
  var data = eq.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === d.nombre) {
      eq.getRange(i + 1, 9).setValue('Inactivo'); // col I = estado
      break;
    }
  }
  return jsonResponse({ ok: true, msg: 'Salida registrada' });
}

function addEvento(d) {
  var sheet = getSheet('Eventos');
  sheet.appendRow([
    d.fecha || '',
    d.titulo || '',
    d.tipo || 'otro',
    d.descripcion || '',
    d.recurrente || 'No'
  ]);
  return jsonResponse({ ok: true, msg: 'Evento agregado' });
}

function updateEquipo(d) {
  if (!d.nombre) return jsonResponse({ error: 'Nombre requerido para update' });
  var sheet = getSheet('Equipo');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === d.nombre) {
      // Actualizar solo campos enviados
      for (var key in d) {
        var col = headers.indexOf(key);
        if (col >= 0 && key !== 'nombre') {
          sheet.getRange(i + 1, col + 1).setValue(d[key]);
        }
      }
      return jsonResponse({ ok: true, msg: 'Miembro actualizado' });
    }
  }
  return jsonResponse({ error: 'Miembro no encontrado: ' + d.nombre });
}
