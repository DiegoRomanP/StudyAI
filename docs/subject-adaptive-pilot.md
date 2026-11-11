# Piloto comparativo de perfiles académicos

Este piloto evalúa el contenido que StudyAI genera para el mismo material y la misma intención de estudio en v1 y v2. En modo demo se puede repetir el recorrido y comprobar el contrato. La revisión de calidad pedagógica requiere una persona competente en cada materia.

## Materiales de prueba

Usar un documento Markdown breve por caso, con los datos de referencia de la tabla. Crear dos planes con la intención `LEARNING` para cada documento, uno con el flujo estándar y otro con la adaptación activada. Elegir el perfil indicado en los cinco primeros casos y «Automático por tema» para el respaldo general y el documento mixto. Mantener iguales los documentos y la configuración del proveedor en cada par.

| Caso | Material de referencia | Comportamiento v2 que se debe observar |
|---|---|---|
| Lógico-deductivo | Un ejemplo de equivalencia entre 3/4, 0,75 y 75 % | Explicación con pasos y un ejercicio distinto del ejemplo. La forma decimal y la fracción equivalentes obtienen la misma corrección cuando el ítem es numérico. |
| Crítico-argumentativo | Dos relatos ficticios que atribuyen la apertura de una biblioteca a causas diferentes, con un encabezado por relato | La lección distingue contexto, afirmación y evidencia. El ensayo permite revisar una rúbrica de argumentación después de entregar. |
| Lingüístico-interpretativo | Un párrafo original sobre una estación vacía narrado desde dos perspectivas | Una pregunta pide inferir y justificar con el texto. El rango base es 10–15 minutos. |
| Sistémico-empírico | Registros sintéticos de altura semanal y una hipótesis sobre condiciones de crecimiento | La lección distingue observación e hipótesis. La tabla de un estímulo reproduce los valores del material. |
| Aplicado-práctico | Un caso ficticio con dos precios, costos unitarios y demanda fija | La lección vincula una decisión a los datos. La solución de la evaluación indica qué datos respaldan la decisión. |
| General | Una nota con instrucciones para organizar materiales de taller | El respaldo general conserva objetivos, un ejemplo y una actividad de aplicación. |
| Mixto | Un documento con secciones separadas de equivalencia de fracciones y análisis de relatos, en Markdown y en PDF | Los dos temas resuelven perfiles distintos. Las lecciones y los resultados mantienen sus propios objetivos. |

## Registro por caso

1. Identificar documento, nivel educativo esperado, intención, versión, perfil efectivo, versión del perfil y proveedor. Mantener iguales el nivel, el material y la meta dentro de cada par. Anotar si el contenido proviene del mock.
2. Verificar alineación con el objetivo, adecuación del formato, exactitud de la clave y respaldo del feedback. Para comparar v1 y v2, usar el mismo objetivo de referencia, aunque v1 no lo muestre en pantalla.
3. Registrar cada criterio como `cumple`, `parcial` o `no cumple` con la pregunta, bloque o fragmento que sustenta la observación. Anotar los errores factuales y la corrección esperada. Una clave incorrecta, una solución expuesta antes de entregar o una fuente inventada bloquea el caso.
4. Guardar por separado la prueba automatizada, la observación del navegador y el juicio humano. El piloto compara el material producido y no mide aprendizaje ni retención.

Para repetir la cobertura automatizada, ejecutar
`python -m pytest -q tests/test_subject_adaptive_flow.py` desde `backend/` y
`CI=true npm run test:e2e` desde `frontend/`. El runner levanta un entorno
aislado con el proveedor demo y guarda el reporte en `frontend/qa-results/`.

## Estado

| Evidencia | Estado |
|---|---|
| Pruebas automatizadas del recorrido adaptativo | `backend/tests/test_subject_adaptive_flow.py` compara seis pares v1/v2 en modo demo y comprueba selección automática en Markdown y en PDF. El caso PDF requiere el extra PyMuPDF. |
| Recorrido v2 en navegador | Siete pruebas Playwright con la API local cubren Inicio, Planes, Práctica, los cinco perfiles, el respaldo general y un documento Markdown mixto. En la evaluación lingüística se comprobaron el teclado, la guía de 10–15 minutos, el envío y la recarga del resultado. La respuesta y la rúbrica se conservan. La autoevaluación local se borra al recargar. |
| Revisión humana por materia | Pendiente |

Los casos automatizados verifican perfil y tiempos efectivos, cobertura de
objetivos, ausencia de campos privados antes de entregar, resultado recuperado y
conservación del snapshot al reforzar. El mock produce ejemplos simulados. La
corrección factual, la calidad de las claves y la utilidad de la rúbrica se
registran en la revisión humana cuando se disponga de materiales y de un
proveedor para esa evaluación.
