# BlackChicken HR — Setup Google Sheet + Apps Script

## Paso 1: Crear el Google Sheet

1. Ir a [sheets.google.com](https://sheets.google.com) → **Nuevo**
2. Nombrar: `BC HR Data`
3. Crear **3 pestañas** (renombrar las que vienen por defecto):

### Pestaña: `Equipo`
| Columna A | B | C | D | E | F | G | H | I | J | K |
|-----------|---|---|---|---|---|---|---|---|---|---|
| nombre | cargo | local | jornada | sueldo_bruto | fecha_ingreso | cumpleanos | tipo_contrato | estado | email | telefono |

### Pestaña: `Salidas`
| Columna A | B | C | D | E | F | G | H |
|-----------|---|---|---|---|---|---|---|
| nombre | cargo | local | fecha_salida | motivo | tipo | tiempo_en_bc | comentarios |

### Pestaña: `Eventos`
| Columna A | B | C | D | E |
|-----------|---|---|---|---|
| fecha | titulo | tipo | descripcion | recurrente |

**Tipos de evento válidos:** feriado, contrato, cumpleanos, evaluacion, capacitacion, otro

4. **Copiar el ID del Sheet** desde la URL:
   `https://docs.google.com/spreadsheets/d/`**ESTE_ES_EL_ID**`/edit`

## Paso 2: Crear el Apps Script

1. En el Sheet → menú **Extensiones → Apps Script**
2. Borrar todo el código por defecto
3. Copiar/pegar el contenido de `google-apps-script.js`
4. En la línea 5, pegar el ID del Sheet:
   ```javascript
   var SHEET_ID = 'PEGAR_AQUI_EL_ID';
   ```
5. **Guardar** (Ctrl+S)

## Paso 3: Deploy como Web App

1. Click en **Implementar → Nueva implementación**
2. Tipo: **App web**
3. Descripción: `BC HR API v1`
4. Ejecutar como: **Yo** (tu cuenta)
5. Quién tiene acceso: **Cualquier persona**
6. Click **Implementar**
7. **Copiar la URL** que te da (empieza con `https://script.google.com/macros/s/...`)
8. **Autorizar** cuando te lo pida (aceptar permisos)

## Paso 4: Pegar la URL en el Hub

Cuando me des la URL, yo la configuro en todos los archivos HTML del hub.

## Paso 5: Cargar datos iniciales

Puedes cargar el equipo actual manualmente o yo te genero un CSV para importar.

---

## Testing rápido

Después del deploy, probar en el navegador:
```
TU_URL?tab=equipo
```
Debería devolver un JSON vacío: `[]`

Para agregar un test:
```bash
curl -X POST TU_URL \
  -H "Content-Type: application/json" \
  -d '{"action":"add_equipo","data":{"nombre":"Test","cargo":"Test","local":"BC1"}}'
```
