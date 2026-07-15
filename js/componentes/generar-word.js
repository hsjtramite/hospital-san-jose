(function () {
  'use strict'

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']

  /* ─── Namespaces requeridos por Word para imágenes inline ─── */
  const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

  function formatearFechaLarga(fechaISO) {
    if (!fechaISO) return ''
    const [anio, mes, dia] = fechaISO.split('-')
    return `${parseInt(dia)} de ${MESES[parseInt(mes) - 1]} del ${anio}`
  }

  /**
   * Descarga y redimensiona una imagen para mantener el tamaño del .docx bajo.
   * Devuelve un ArrayBuffer con los bytes PNG, o null si falla.
   */
  async function optimizarImagen(url, maxAncho) {
    if (!url) return null

    try {
      const resp = await fetch(url)
      if (!resp.ok) return null
      const blob = await resp.blob()
      if (blob.size === 0) return null

      const objectUrl = URL.createObjectURL(blob)

      const img = await new Promise((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error('Error al cargar imagen'))
        i.crossOrigin = 'anonymous'
        i.src = objectUrl
      })

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const escala = Math.min(1, maxAncho / img.width)
      canvas.width = Math.round(img.width * escala)
      canvas.height = Math.round(img.height * escala)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      URL.revokeObjectURL(objectUrl)

      return await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (!b) return reject(new Error('canvas.toBlob devolvió null'))
          b.arrayBuffer().then(resolve).catch(reject)
        }, 'image/png')
      })
    } catch (err) {
      console.warn('[generarWord] No se pudo optimizar la firma:', err.message)
      return null
    }
  }

  /* ─── Insertar relación de imagen en document.xml.rels ─── */
  function agregarRelacionImagen(relsXml) {
    const matches = relsXml.match(/Id="rId(\d+)"/g) || []
    let maxId = 0
    for (const m of matches) {
      const num = parseInt(m.replace(/[^0-9]/g, ''), 10)
      if (num > maxId) maxId = num
    }
    const newRId = 'rId' + (maxId + 1)
    const nuevaRel = `  <Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/firma.png"/>\n`
    return {
      relsXml: relsXml.replace('</Relationships>', nuevaRel + '</Relationships>'),
      newRId,
    }
  }

  /**
   * Asegura que los namespaces necesarios para imágenes estén declarados
   * en el elemento raíz <w:document>, no en nodos internos.
   */
  function asegurarNamespacesEnRaiz(docXml) {
    const nsMap = {
      'xmlns:wp': NS_WP,
      'xmlns:a': NS_A,
      'xmlns:pic': NS_PIC,
      'xmlns:r': NS_R,
    }

    // Buscar la apertura de <w:document ...>
    const tagMatch = docXml.match(/<w:document\b[^>]*>/)
    if (!tagMatch) return docXml

    let tag = tagMatch[0]
    let modificado = false

    for (const [attr, uri] of Object.entries(nsMap)) {
      if (!tag.includes(attr + '=')) {
        tag = tag.replace(/>$/, ` ${attr}="${uri}">`)
        modificado = true
      }
    }

    if (modificado) {
      docXml = docXml.replace(tagMatch[0], tag)
    }
    return docXml
  }

  /**
   * Genera el XML DrawingML para insertar una imagen inline.
   * No declara namespaces propios — depende de que estén en <w:document>.
   */
  function construirImagenXml(rId) {
    return (
      '<w:r><w:rPr><w:noProof/></w:rPr><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="1143000" cy="411480"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="999" name="Firma" descr="Firma"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic>' +
      '<pic:nvPicPr><pic:cNvPr id="0" name="Picture 1" descr="Firma"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1143000" cy="411480"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr>' +
      '</pic:pic>' +
      '</a:graphicData></a:graphic>' +
      '</wp:inline></w:drawing></w:r>'
    )
  }

  /**
   * Reemplaza el marcador ####FIRMA#### con la imagen, manejando el caso
   * donde docxtemplater divide el texto en múltiples <w:r> runs.
   *
   * Estrategia:
   *  1. Intentar match de un solo run  (caso ideal).
   *  2. Si no hay match, buscar el texto plano ####FIRMA#### que puede
   *     cruzar varios <w:r>…</w:r> y reemplazar el bloque completo
   *     desde el primer run que contiene parte del marcador hasta el último.
   */
  function reemplazarMarcadorConImagen(docXml, rId) {
    const imgXml = construirImagenXml(rId)

    // ── Intento 1: el marcador está en un solo <w:r> ──
    const singleRunRx = /<w:r\b[^>]*>(?:<w:rPr>(?:(?!<\/w:r\b)[\s\S])*?<\/w:rPr>)?\s*<w:t[^>]*>####FIRMA####<\/w:t>\s*<\/w:r>/
    if (singleRunRx.test(docXml)) {
      return docXml.replace(singleRunRx, imgXml)
    }

    // ── Intento 2: el marcador está repartido entre runs ──
    // Extraemos solo el texto plano de todas las <w:t> para detectar posición
    const textosRx = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g
    let textoPlano = ''
    let match
    while ((match = textosRx.exec(docXml)) !== null) {
      textoPlano += match[1]
    }

    if (!textoPlano.includes('####FIRMA####')) {
      // Si el marcador no aparece, devolver sin cambios
      console.warn('[generarWord] Marcador ####FIRMA#### no encontrado en document.xml')
      return docXml
    }

    // Estrategia: reemplazar cualquier secuencia de <w:r> que juntas formen ####FIRMA####
    const firmaChars = '####FIRMA####'
    let pattern = ''
    for (let i = 0; i < firmaChars.length; i++) {
      const c = firmaChars[i] === '#' ? '\\#' : firmaChars[i]
      if (i === 0) {
        // Inicio: capturar desde el <w:r> que contiene el primer carácter
        pattern += '<w:r\\b[^>]*>(?:<w:rPr>(?:(?!<\\/w:r\\b)[\\s\\S])*?<\\/w:rPr>)?\\s*<w:t[^>]*>[^<]*?' + c
      } else {
        // Permitir cierre/apertura de runs entre caracteres
        pattern += '(?:<\\/w:t>\\s*<\\/w:r>\\s*<w:r\\b[^>]*>(?:<w:rPr>(?:(?!<\\/w:r\\b)[\\s\\S])*?<\\/w:rPr>)?\\s*<w:t[^>]*>)?' + c
      }
    }
    pattern += '[^<]*?<\\/w:t>\\s*<\\/w:r>'

    const multiRunRx = new RegExp(pattern)
    if (multiRunRx.test(docXml)) {
      return docXml.replace(multiRunRx, imgXml)
    }

    // ── Intento 3 (fallback simple): buscar toda la <w:p> que contiene el marcador ──
    // y reemplazar solo los runs del marcador dentro de ese párrafo
    const paragraphs = docXml.split(/(<w:p\b[^>]*>[\s\S]*?<\/w:p>)/g)
    const rebuilt = paragraphs.map((segment) => {
      // Verificar si este párrafo contiene el marcador
      const segTexts = []
      const tRx = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g
      let m
      while ((m = tRx.exec(segment)) !== null) {
        segTexts.push(m[1])
      }
      if (segTexts.join('').includes('####FIRMA####')) {
        // Reemplazar todos los <w:r> de este párrafo con la imagen
        const limpio = segment
          .replace(/<w:r\b[^>]*>(?:(?!<\/w:r\b)[\s\S])*?<\/w:r>/g, '')  // quitar todos los runs (de forma segura)
          .replace('</w:p>', imgXml + '</w:p>')           // insertar imagen antes del cierre
        return limpio
      }
      return segment
    })

    return rebuilt.join('')
  }

  /**
   * Asegurar que [Content_Types].xml tenga la extensión PNG registrada.
   */
  function asegurarContentTypePng(zip) {
    const ctEntry = zip.file('[Content_Types].xml')
    if (!ctEntry) return

    let ctXml = ctEntry.asText()
    if (ctXml.includes('Extension="png"')) return

    // Insertar <Default> para png antes del primer <Override> o antes del cierre
    if (ctXml.includes('<Override')) {
      ctXml = ctXml.replace(
        '<Override',
        '<Default Extension="png" ContentType="image/png"/>\n<Override'
      )
    } else {
      ctXml = ctXml.replace(
        '</Types>',
        '<Default Extension="png" ContentType="image/png"/>\n</Types>'
      )
    }
    zip.file('[Content_Types].xml', ctXml)
  }

  /* ═══════════════════════════════════════════════════════
     FUNCIÓN PRINCIPAL: generarWord
     ═══════════════════════════════════════════════════════ */
  async function generarWord(datos) {
    const {
      tipo_documento: tipoDoc,
      numero_documento: numDoc,
      fecha,
      destinatario,
      cargo,
      asunto,
      cuerpo,
      firma_url,
    } = datos

    const resp = await fetch('assets/plantillas/Plantilla - Emitir.docx')
    const buffer = await resp.arrayBuffer()

    const zip = new PizZip(buffer)

    let rIdImagen = null
    if (firma_url) {
      const firmaBytes = await optimizarImagen(firma_url, 250)
      if (firmaBytes) {
        zip.file('word/media/firma.png', firmaBytes)

        asegurarContentTypePng(zip)

        const relsEntry = zip.file('word/_rels/document.xml.rels')
        if (relsEntry) {
          const relsXml = relsEntry.asText()
          const { relsXml: nuevosRels, newRId } = agregarRelacionImagen(relsXml)
          zip.file('word/_rels/document.xml.rels', nuevosRels)
          rIdImagen = newRId
        } else {
          const nuevaRels =
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/firma.png"/>' +
            '</Relationships>'
          zip.file('word/_rels/document.xml.rels', nuevaRels)
          rIdImagen = 'rId1'
        }
      }
    }

    const doc = new window.docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    })

    doc.render({
      FECHA_LARGA: formatearFechaLarga(fecha),
      TIPO_DOC: tipoDoc,
      NUM_DOC: numDoc,
      DESTINATARIO: destinatario || '',
      CARGO: cargo || '',
      ASUNTO: asunto || '',
      CUERPO: cuerpo || '',
      FIRMA: rIdImagen ? '####FIRMA####' : '',
    })

    if (rIdImagen) {
      const zipRender = doc.getZip()
      const docEntry = zipRender.file('word/document.xml')
      if (docEntry) {
        let docXml = docEntry.asText()
        // 1. Asegurar namespaces en el elemento raíz <w:document>
        docXml = asegurarNamespacesEnRaiz(docXml)
        // 2. Reemplazar marcador con la imagen
        docXml = reemplazarMarcadorConImagen(docXml, rIdImagen)
        zipRender.file('word/document.xml', docXml)
      }
    }

    return doc.getZip().generate({ type: 'blob', compression: 'DEFLATE' })
  }

  async function generarYSubirWord(datos, carpetaUsuario, supabase) {
    const blob = await generarWord(datos)
    const nombre = `emitidos/${carpetaUsuario}/${datos.numero_documento}.docx`

    const { error } = await supabase.storage
      .from('documentos')
      .upload(nombre, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

    if (error) throw new Error(`Error al subir Word: ${error.message}`)

    const { data: { publicUrl } } = supabase.storage
      .from('documentos')
      .getPublicUrl(nombre)

    return { ruta: nombre, url: publicUrl }
  }

  window.generarYSubirWord = generarYSubirWord
  window.generarWordBlob = generarWord
})()
