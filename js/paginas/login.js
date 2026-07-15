const ERRORES = {
  'Token has expired or is invalid': 'El código ha expirado o no es válido',
  'Invalid login credentials': 'Usuario o contraseña incorrectos',
  'Email not confirmed': 'Correo electrónico no confirmado',
  'Email rate limit exceeded': 'Demasiados intentos. Espera un momento',
};

function traducirError(mensaje) {
  return ERRORES[mensaje] || mensaje;
}

document.addEventListener('DOMContentLoaded', () => {

  // ============================================
  // ELEMENTOS
  // ============================================
  const formLogin = document.getElementById('formLogin');
  const txtUsuario = document.getElementById('txtUsuario');
  const txtContrasena = document.getElementById('txtContrasena');
  const chkRecordar = document.getElementById('chkRecordar');
  const btnMostrarPass = document.getElementById('btnMostrarPass');
  const lnkOlvidaste = document.getElementById('lnkOlvidaste');

  // ============================================
  // MOSTRAR / OCULTAR CONTRASEÑA
  // ============================================
  btnMostrarPass.addEventListener('click', () => {
    const esPassword = txtContrasena.type === 'password';
    txtContrasena.type = esPassword ? 'text' : 'password';
    btnMostrarPass.className = esPassword
      ? 'ph ph-eye-slash toggle-password'
      : 'ph ph-eye toggle-password';
  });

  // ============================================
  // RECORDARME — CARGAR USUARIO GUARDADO
  // ============================================
  const usuarioRecordado = localStorage.getItem('usuario_recordado');
  if (usuarioRecordado) {
    txtUsuario.value = usuarioRecordado;
    chkRecordar.checked = true;
  }

  // ============================================
  // INICIAR SESIÓN — SUPABASE
  // ============================================
  const errorUsuario = document.getElementById('error-usuario');
  const errorContrasena = document.getElementById('error-contrasena');
  let loginTimeoutId = null;

  function limpiarTimerLogin() {
    if (loginTimeoutId) {
      clearTimeout(loginTimeoutId);
      loginTimeoutId = null;
    }
  }

  function esErrorDeRedLogin(err) {
    const mensaje = typeof err?.message === 'string' ? err.message : String(err || '');
    const texto = mensaje.toLowerCase();
    return navigator.onLine === false || texto.includes('failed to fetch') || texto.includes('networkerror') || texto.includes('load failed');
  }

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();

    errorUsuario.textContent = '';
    errorContrasena.textContent = '';

    const usuario = txtUsuario.value.trim();
    const contrasena = txtContrasena.value;

    if (!usuario || !contrasena) return;

    if (navigator.onLine === false) {
      errorContrasena.textContent = 'No se pudo conectar. Revisa tu conexión a internet e intenta nuevamente.';
      return;
    }

    setCargandoLogin(true);
    let loginEnProgreso = true;
    loginTimeoutId = setTimeout(() => {
      if (loginEnProgreso) {
        errorContrasena.textContent = 'La conexión está tardando más de lo normal...';
      }
    }, 15000);

    try {
      const { data: perfil, error: errBusqueda } = await supabase
        .from('perfiles')
        .select('gmail, activo')
        .ilike('nombre_usuario', usuario)
        .maybeSingle();

      if (errBusqueda || !perfil) {
        if (errBusqueda && esErrorDeRedLogin(errBusqueda)) {
          errorContrasena.textContent = 'No se pudo conectar. Revisa tu conexión a internet e intenta nuevamente.';
          return;
        }
        errorUsuario.textContent = 'Usuario no encontrado';
        return;
      }

      if (perfil.activo === false) {
        errorUsuario.textContent = 'Cuenta desactivada. Contacte al administrador';
        return;
      }

      const { error: errAuth } = await supabase.auth.signInWithPassword({
        email: perfil.gmail.toLowerCase(),
        password: contrasena
      });

      if (errAuth) {
        if (esErrorDeRedLogin(errAuth)) {
          errorContrasena.textContent = 'No se pudo conectar. Revisa tu conexión a internet e intenta nuevamente.';
          return;
        }
        errorContrasena.textContent = traducirError(errAuth.message);
        return;
      }

      if (chkRecordar.checked) {
        localStorage.setItem('usuario_recordado', usuario);
      } else {
        localStorage.removeItem('usuario_recordado');
      }

      window.location.href = 'dashboard.html';

    } catch (err) {
      if (esErrorDeRedLogin(err)) {
        errorContrasena.textContent = 'No se pudo conectar. Revisa tu conexión a internet e intenta nuevamente.';
      } else {
        errorContrasena.textContent = 'Error de conexión con el servidor';
      }
    } finally {
      loginEnProgreso = false;
      limpiarTimerLogin();
      setCargandoLogin(false);
    }
  });

  function setCargandoLogin(activo) {
    document.getElementById('btnIniciarSesion').disabled = activo;
    document.getElementById('texto-login').style.display = activo ? 'none' : 'inline';
    document.getElementById('spinner-login').style.display = activo ? 'block' : 'none';
  }

  // ============================================
  // MODAL — RECUPERACIÓN DE CONTRASEÑA
  // ============================================
  const modal = document.getElementById('modal-recuperacion');
  const btnCerrar = document.getElementById('btn-cerrar-recuperacion');
  const btnCancelar = document.getElementById('btn-cancelar-recuperacion');
  const btnAccion = document.getElementById('btn-accion-recuperacion');
  const txtAccion = document.getElementById('texto-accion');
  const paso1 = document.getElementById('paso-1');
  const paso2 = document.getElementById('paso-2');
  const paso3 = document.getElementById('paso-3');
  const pasoExito = document.getElementById('paso-exito');
  const dot1 = document.getElementById('dot-1');
  const dot2 = document.getElementById('dot-2');
  const dot3 = document.getElementById('dot-3');
  const recuperarEmail = document.getElementById('recuperar-email');
  const emailDestino = document.getElementById('email-destino');
  const otpCasillas = document.querySelectorAll('.otp-casilla');
  const timerSegundos = document.getElementById('timer-segundos');
  const timerTexto = document.getElementById('timer-texto');
  const btnReenviar = document.getElementById('btn-reenviar');
  const nuevaPass = document.getElementById('nueva-pass');
  const confirmarPass = document.getElementById('confirmar-pass');
  const reqMin = document.getElementById('req-min');
  const reqMatch = document.getElementById('req-match');
  const recuperarError = document.getElementById('recuperar-error');

  let pasoActual = 1;
  let timerInterval = null;

  // Abrir modal
  lnkOlvidaste.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.add('activo');
    resetModal();
  });

  // Cerrar modal
  const cerrarModal = () => {
    const recargar = pasoActual === 4;
    modal.classList.remove('activo');
    clearInterval(timerInterval);
    if (recargar) location.reload();
  };

  btnCerrar.addEventListener('click', cerrarModal);
  btnCancelar.addEventListener('click', cerrarModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cerrarModal();
  });

  // Reiniciar modal
  function resetModal() {
    pasoActual = 1;
    paso1.style.display = 'block';
    paso2.style.display = 'none';
    paso3.style.display = 'none';
    pasoExito.style.display = 'none';
    dot1.className = 'paso-dot activo';
    dot2.className = 'paso-dot';
    dot3.className = 'paso-dot';
    txtAccion.textContent = 'Enviar Código';
    btnAccion.style.display = 'flex';
    recuperarError.textContent = '';
    recuperarEmail.value = '';
    otpCasillas.forEach(c => { c.value = ''; c.classList.remove('llena'); });
    nuevaPass.value = '';
    confirmarPass.value = '';
    reqMin.classList.remove('cumplido');
    reqMatch.classList.remove('cumplido');
    clearInterval(timerInterval);
    timerTexto.style.display = 'block';
    btnReenviar.style.display = 'none';
    timerSegundos.textContent = '60';
    recuperarEmail.focus();
  }

  // Navegar entre pasos
  function irPaso(paso) {
    paso1.style.display = paso === 1 ? 'block' : 'none';
    paso2.style.display = paso === 2 ? 'block' : 'none';
    paso3.style.display = paso === 3 ? 'block' : 'none';
    pasoExito.style.display = paso === 4 ? 'block' : 'none';

    dot1.className = paso > 1 ? 'paso-dot completado' : paso === 1 ? 'paso-dot activo' : 'paso-dot';
    dot2.className = paso === 2 ? 'paso-dot activo' : paso > 2 ? 'paso-dot completado' : 'paso-dot';
    dot3.className = paso === 3 ? 'paso-dot activo' : paso > 3 ? 'paso-dot completado' : 'paso-dot';

    if (paso === 1) txtAccion.textContent = 'Enviar Código';
    else if (paso === 2) txtAccion.textContent = 'Verificar Código';
    else if (paso === 3) txtAccion.textContent = 'Restablecer Contraseña';
    else if (paso === 4) btnAccion.style.display = 'none';

    pasoActual = paso;
  }

  // Botón de acción principal
  btnAccion.addEventListener('click', async () => {
    if (pasoActual === 1) {
      const email = recuperarEmail.value.trim().toLowerCase();
      if (!email.endsWith('@gmail.com')) {
        recuperarError.textContent = 'El correo debe ser de Gmail (@gmail.com)';
        return;
      }
      recuperarError.textContent = '';
      setCargando(true);

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('gmail')
        .eq('gmail', email)
        .maybeSingle();

      if (!perfil) {
        setCargando(false);
        recuperarError.textContent = 'Este correo no está registrado en el sistema';
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email);

      setCargando(false);

      if (error) {
        recuperarError.textContent = traducirError(error.message);
        return;
      }

      emailDestino.textContent = email;
      irPaso(2);
      iniciarTimer();
      setTimeout(() => otpCasillas[0].focus(), 100);
    } else if (pasoActual === 2) {
      const codigo = Array.from(otpCasillas).map(c => c.value).join('');
      if (codigo.length < 8) {
        recuperarError.textContent = 'Ingrese el código completo de 8 dígitos';
        return;
      }
      recuperarError.textContent = '';
      setCargando(true);

      const { error } = await supabase.auth.verifyOtp({
        email: emailDestino.textContent,
        token: codigo,
        type: 'recovery'
      });

      setCargando(false);

      if (error) {
        recuperarError.textContent = traducirError(error.message);
        return;
      }

      irPaso(3);
      setTimeout(() => nuevaPass.focus(), 100);
    } else if (pasoActual === 3) {
      const pass = nuevaPass.value;
      const confirm = confirmarPass.value;
      if (pass.length < 6) {
        recuperarError.textContent = 'La contraseña debe tener al menos 6 caracteres';
        return;
      }
      if (pass !== confirm) {
        recuperarError.textContent = 'Las contraseñas no coinciden';
        return;
      }
      recuperarError.textContent = '';
      setCargando(true);

      const { error } = await supabase.auth.updateUser({
        password: pass
      });

      setCargando(false);

      if (error) {
        recuperarError.textContent = traducirError(error.message);
        return;
      }

      irPaso(4);
    }
  });

  function setCargando(activo) {
    btnAccion.disabled = activo;
    document.getElementById('texto-accion').style.display = activo ? 'none' : 'inline';
    document.getElementById('spinner-recuperacion').style.display = activo ? 'block' : 'none';
  }

  // OTP — auto-focus entre casillas
  otpCasillas.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.classList.toggle('llena', input.value.length === 1);
      if (input.value.length === 1 && index < 7) {
        otpCasillas[index + 1].focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        otpCasillas[index - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const data = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 8);
      data.split('').forEach((char, i) => {
        if (otpCasillas[i]) {
          otpCasillas[i].value = char;
          otpCasillas[i].classList.add('llena');
        }
      });
      otpCasillas[Math.min(data.length, 7)].focus();
    });
  });

  // Timer de reenvío
  function iniciarTimer() {
    clearInterval(timerInterval);
    let segundos = 60;
    timerSegundos.textContent = segundos;
    timerTexto.style.display = 'block';
    btnReenviar.style.display = 'none';

    timerInterval = setInterval(() => {
      segundos--;
      timerSegundos.textContent = segundos;
      if (segundos <= 0) {
        clearInterval(timerInterval);
        timerTexto.style.display = 'none';
        btnReenviar.style.display = 'inline';
      }
    }, 1000);
  }

  btnReenviar.addEventListener('click', async () => {
    btnReenviar.disabled = true;
    await supabase.auth.resetPasswordForEmail(emailDestino.textContent);
    btnReenviar.disabled = false;
    iniciarTimer();
    otpCasillas.forEach(c => { c.value = ''; c.classList.remove('llena'); });
    otpCasillas[0].focus();
  });

  // Validación de contraseñas en tiempo real
  nuevaPass.addEventListener('input', validarPass);
  confirmarPass.addEventListener('input', validarPass);

  function validarPass() {
    const pass = nuevaPass.value;
    const confirm = confirmarPass.value;
    reqMin.classList.toggle('cumplido', pass.length >= 6);
    reqMatch.classList.toggle('cumplido', pass.length > 0 && pass === confirm);
  }

  // ============================================
  // OJO MOSTRAR/OCULTAR (Nueva Contraseña)
  // ============================================
  document.querySelectorAll('.toggle-md-pass').forEach(icono => {
    icono.addEventListener('click', () => {
      const input = document.getElementById(icono.dataset.target);
      const esPass = input.type === 'password';
      input.type = esPass ? 'text' : 'password';
      icono.className = esPass ? 'ph ph-eye-slash toggle-md-pass' : 'ph ph-eye toggle-md-pass';
    });
  });

  // ============================================
  // ENTER EN MODAL
  // ============================================
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && modal.classList.contains('activo') && pasoActual !== 4) {
      e.preventDefault();
      btnAccion.click();
    }
  });

});
