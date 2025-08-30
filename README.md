# MathSnap Solver

Aplicación web para resolver problemas matemáticos desde una foto o texto, mostrando el resultado paso a paso con notación LaTeX.

## Características
- OCR en el navegador con Tesseract.js (opciones: Auto/Bloque/Una línea)
- Preprocesamiento de imagen: escala, grises y binarización (Otsu)
- Resolución paso a paso:
  - Álgebra básica con MathSteps (simplificación/ecuaciones)
  - Fallback propio para ecuaciones lineales de una variable con pasos
  - Mini-pasos para sqrt y potencias simples
- Sistemas de ecuaciones lineales (n ecuaciones, m variables) con Math.js
- Render LaTeX con MathJax
- Exportación a PDF del panel de resultados (html2pdf)
- Cámara y subida de imágenes con vista previa y vista previa procesada
- UI en Bootstrap 5 con diseño moderno (hero, gradientes) y ayuda integrada de modos OCR

## Stack
- Bootstrap 5.3 (UI)
- Tesseract.js 5 (OCR)
- Math.js 13 (evaluación numérica/simbólica básica y álgebra lineal)
- MathSteps 0.4 (pasos de álgebra)
- MathJax 3 (LaTeX)
- html2pdf.js (exportación a PDF)

## Uso local
1. Clona o descarga el repositorio.
2. Abre `index.html` en tu navegador. No requiere build.
3. Sube una imagen o usa la cámara; opcionalmente escribe la expresión manual.
4. Elige el Modo OCR si es necesario y deja activa “Mejora automática de imagen”.
5. Presiona “Resolver” para ver el paso a paso.

## Consejos de OCR
- Encadra exclusivamente el ejercicio, con buena luz y foco.
- Usa “Una línea” para una sola ecuación; “Auto/Bloque” para múltiples líneas.
- Si la imagen está muy clara, puedes desactivar la mejora automática.

## Despliegue en GitHub Pages
- Rama `main` con `index.html` en la raíz.
- En GitHub: Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/root`.

## Estructura
```
assets/
  css/styles.css
  img/logo.svg
  js/app.js
index.html
```

## Créditos
- By: Ciscode — Sitio: https://ciscodedev.netlify.app/

## Notas
- Este proyecto muestra pasos donde es posible (limitaciones de MathSteps). Para casos avanzados se usan evaluaciones o resolutores específicos.
