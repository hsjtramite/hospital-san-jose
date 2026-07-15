(async () => {
  // 1. Limpiar DB
  await supabase.from('documentos_archivos').delete().neq('id', 0)
  await supabase.from('documentos').delete().neq('id', 0)
  await supabase.from('contadores_documentos').delete().neq('id', 0)
  console.log('✓ DB limpia')

  // 2. Limpiar Storage
  const bucket = supabase.storage.from('documentos')
  for (const carpeta of ['emitidos', 'temp', 'derivados']) {
    const { data } = await bucket.list(carpeta, { limit: 1000 })
    if (data?.length) {
      for (const item of data) {
        if (item.id) {
          await bucket.remove([`${carpeta}/${item.name}`])
        } else {
          const { data: archivos } = await bucket.list(`${carpeta}/${item.name}`, { limit: 1000 })
          if (archivos?.length) {
            await bucket.remove(archivos.map(a => `${carpeta}/${item.name}/${a.name}`))
            await bucket.remove([`${carpeta}/${item.name}`])
          }
        }
      }
    }
  }
  console.log('✓ Storage limpio')
  console.log('¡Todo listo!')
})()
