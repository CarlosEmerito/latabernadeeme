# Repaso de los perfiles de monstruo

Auditoría: `tools/verify/auditar_monstruos.py` (compara cada ficha con el texto
del PDF correspondiente).

## Qué comprueba

1. **Campos obligatorios**: tamaño, tipo, alineamiento, CA, PG, velocidad y VD.
2. **Las seis características** presentes y numéricas.
3. **Apartados**: que existan `## Acciones` cuando la criatura tiene acciones.
4. **Fidelidad**: el primer rasgo de la ficha debe aparecer literalmente en el
   PDF (normalizando espacios y las particiones de palabra del original).

## Resultado

| Edición | Fichas | Sin campos | Características mal | Sin acciones | No literales |
|---|---:|---:|---:|---:|---:|
| 5e (SRD 5.1) | 317 | 0 | 0 | 3 | 0 |
| 5.5 (SRD 5.2.1) | 330 | 0 | 0 | 1 | 0 |

Las cuatro fichas «sin acciones» son criaturas que efectivamente no tienen
ninguna en el original: caballito de mar, rana, chillón y hongo chillón.

Las treinta criaturas que faltaban para llegar a 317 y 330 llegaron después de
que se escribiera este informe, con `tools/ingest/completar_monstruos.py`. Las
cifras se vuelven a medir en cada pasada con `tools/test/cifras.py`, así que ya
no pueden quedar atrás.

## Qué estaba roto y cómo se arregló

- **Rasgos fundidos en un solo párrafo.** El conversor unía líneas por
  proximidad vertical y perdía el límite de párrafo del PDF. Ahora cada línea
  conserva el identificador de bloque de poppler y el texto se corta cuando
  cambia el bloque: cada rasgo y cada acción quedan separados.
- **Apartados `Acciones` ausentes** en 199 fichas del 5.2 y 13 del 5.1: al no
  detectarse el encabezado, las acciones caían dentro de «Rasgos». Resuelto con
  el mismo cambio de bloques.
- **Falsos negativos de fidelidad** (251 y 264 fichas): la comprobación
  comparaba el cuerpo con el texto en bruto, donde el PDF parte palabras
  («des- garro»). La auditoría ahora recompone esas particiones antes de
  comparar.

## Cómo repetirlo

```bash
.venv-ingest/bin/python tools/ingest/descargar.py --solo-flujo --forzar
.venv-ingest/bin/python tools/ingest/extract_core.py
.venv-ingest/bin/python tools/verify/auditar_monstruos.py
```
