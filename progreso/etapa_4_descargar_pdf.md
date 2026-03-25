# Etapa 3: Descarga Segura de Guías (PDF)

## Contexto
El flujo de despacho no está completo si no se pueden entregar e imprimir los rótulos físicos (stickers). El gran problema con la API de Dropi es que la ruta oficial para descargar el PDF (`https://api.dropi.co/guias/transportadora/sticker.pdf`) requiere autenticación activa y bloquea las descargas directas desde dominios externos (CORS), impidiendo que nuestro Frontend pueda procesarlo naturalmente.

Para solucionar esto, hemos fabricado una Edge Function especializada: `dropi-download-pdf`.

## La Edge Function: `dropi-download-pdf`

Esta función es un proxy maestro que engaña a Dropi conectándose desde el backend, inyectando el token vigente y extrayendo el archivo PDF binario para entregárselo libremente a nuestra plataforma.

### Flujo de Uso (Desde el Frontend)

Para que tu aplicación frontend descargue el PDF, debes hacer una petición `GET` enviando dos parámetros en la URL. 

**Ruta a consumir en Supabase:** 
`GET /functions/v1/dropi-download-pdf?transportadora={{TRANSPORTADORA_NORMALIZADA}}&sticker={{NOMBRE_DEL_STICKER}}`

**Extracción de Variables:**
Dado el `JSON` de respuesta de cuando consultas la orden a través de nuestro endpoint `dropi-orders`, debes extraer los valores de la siguiente manera:

1. **Sticker**: Dropi nos entrega una ruta larga en la propiedad `"guia_urls3"` (ej. `"colombia/guias/interrapidisimo/ORDEN-69985260-GUIA-240048852883.pdf"`). 
   - Debes dividir esta cadena por las barras `"/"` y tomar la **última parte**: `ORDEN-69985260-GUIA-240048852883.pdf`.
   
2. **Transportadora Normalizada**: La propiedad `"distribution_company.name"` nos dirá si es INTERRAPIDISIMO, SERVIENTREGA, ENVIA, DOMINA, etc. Debes seguir estas reglas obligatorias de formato y pasarlas a **minúsculas**:
   - `SERVIENTREGA` o `ENVIA` => `servientrega`
   - `INTERRAPIDISIMO` => `interrapidisimo`
   - `DOMINA` => `domina`
   - `COORDINADORA` => `coordinadora`

### Ejemplo Práctico de Consumo en Javascript o React
Ojo, muy importante: debes decirle a axios explícitamente que la respuesta es un "arreglo de bits" (`arraybuffer` o `blob`) ya que no estamos recibiendo texto JSON, sino un archivo pesado.

```javascript
// Usando Axios
const response = await axios.get('https://tu-url-supabase.co/functions/v1/dropi-download-pdf?transportadora=interrapidisimo&sticker=ORDEN-69985260-GUIA-240048852883.pdf', {
    responseType: 'arraybuffer' // TOTALMENTE CRÍTICO
});

// Convertir para descargar en el navegador (React/JS nativo)
const blob = new Blob([response.data], { type: 'application/pdf' });
const linkUrl = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = linkUrl;
a.download = "Rótulo_Dropi_Oriden_69985260.pdf";
a.click();
```

### Respuestas y Manejo de Errores

#### ✅ Descarga Exitosa (Status 200 OK)
El endpoint devolverá el contenido crudo binario, y los headers incluirán un claro:
- `Content-Type: application/pdf`

#### ❌ Error por campos faltantes (Status 400)
Si omites la transportadora o el sticker en tu URL de petición, nuestra Edge Function te regañará:
```json
{
  "error": "Missing transportadora or sticker params"
}
```

#### ❌ Error de Autenticación Dropi (Status 404/500)
Si por alguna razón la guía no existe, no ha sido generada todavía, o la transportadora fue escrita incorrectamente, la Edge Function delegará el error:
```json
{
  "error": "Dropi responded with 404",
  "details": "<Html del error oficial de Dropi...>"
}
```
